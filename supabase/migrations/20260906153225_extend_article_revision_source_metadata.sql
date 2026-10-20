create or replace function private.revise_published_article(p_payload jsonb)
returns table(state text, revision_number integer, article_slug text)
language plpgsql
set search_path = ''
as $$
declare
  v_slug text := nullif(btrim(p_payload->>'slug'), '');
  v_revision_key text := nullif(btrim(p_payload->>'revisionKey'), '');
  v_revision_type text := nullif(btrim(p_payload->>'revisionType'), '');
  v_reason text := nullif(btrim(p_payload->>'reason'), '');
  v_evidence_urls jsonb := coalesce(p_payload->'evidenceUrls', '[]'::jsonb);
  v_notices jsonb := coalesce(p_payload->'visibleNotices', '{}'::jsonb);
  v_translations jsonb := p_payload->'translations';
  v_source_name_supplied boolean := p_payload ? 'sourceName';
  v_source_url_supplied boolean := p_payload ? 'sourceUrl';
  v_source_name text := nullif(btrim(p_payload->>'sourceName'), '');
  v_source_url text := nullif(btrim(p_payload->>'sourceUrl'), '');
  v_article_before jsonb;
  v_article_after jsonb;
  v_translations_before jsonb;
  v_translations_after jsonb;
  v_locale text;
  v_translation jsonb;
  v_body jsonb;
  v_takeaways jsonb;
  v_notice text;
  v_revision integer;
  v_locale_count integer;
begin
  if v_slug is null or v_revision_key is null or v_reason is null then
    raise exception 'slug, revisionKey and reason are required';
  end if;
  if length(v_reason) < 10 then
    raise exception 'reason must contain at least 10 characters';
  end if;
  if v_revision_type not in ('editorial', 'correction') then
    raise exception 'revisionType must be editorial or correction';
  end if;
  if jsonb_typeof(v_evidence_urls) <> 'array' then
    raise exception 'evidenceUrls must be an array';
  end if;
  if jsonb_typeof(v_translations) <> 'object' then
    raise exception 'translations must be an object';
  end if;
  if v_source_name_supplied <> v_source_url_supplied then
    raise exception 'sourceName and sourceUrl must be supplied together';
  end if;
  if v_source_name_supplied and (
    v_source_name is null
    or v_source_url is null
    or v_source_url !~ '^https://'
  ) then
    raise exception 'sourceName and a valid HTTPS sourceUrl are required';
  end if;

  select to_jsonb(a)
    into v_article_before
  from public.articles as a
  where a.slug = v_slug and a.status = 'published'
  for update;

  if v_article_before is null then
    raise exception 'published article not found: %', v_slug;
  end if;

  if v_source_name_supplied and not exists (
    select 1
    from public.article_sources as s
    where s.article_slug = v_slug
      and s.publisher = v_source_name
      and s.url = v_source_url
      and s.source_type in ('primary', 'institutional', 'review')
  ) then
    raise exception 'main source must match a recorded primary, institutional or review source';
  end if;

  select r.revision_number
    into v_revision
  from private.article_revision_log as r
  where r.article_slug = v_slug and r.revision_key = v_revision_key;

  if v_revision is not null then
    return query select 'already_applied'::text, v_revision, v_slug;
    return;
  end if;

  select count(*)
    into v_locale_count
  from jsonb_object_keys(v_translations) as k(locale)
  where k.locale = any(array['pt','en','es','zh','hi','ja','ru']);

  if v_locale_count <> 7
     or (select count(*) from jsonb_object_keys(v_translations)) <> 7 then
    raise exception 'translations must contain exactly pt, en, es, zh, hi, ja and ru';
  end if;

  if v_revision_type = 'correction' then
    if jsonb_typeof(v_notices) <> 'object'
       or (select count(*) from jsonb_object_keys(v_notices)) <> 7 then
      raise exception 'corrections require one visible notice for each locale';
    end if;
  elsif v_notices <> '{}'::jsonb then
    raise exception 'editorial revisions cannot include visible notices';
  end if;

  select coalesce(
    jsonb_object_agg(
      t.locale,
      jsonb_build_object(
        'category', t.category,
        'title', t.title,
        'dek', t.dek,
        'body', t.body,
        'takeaways', t.takeaways,
        'updated_at', t.updated_at
      )
    ),
    '{}'::jsonb
  )
  into v_translations_before
  from public.article_translations as t
  where t.article_slug = v_slug;

  foreach v_locale in array array['pt','en','es','zh','hi','ja','ru']
  loop
    v_translation := v_translations->v_locale;
    if jsonb_typeof(v_translation) <> 'object' then
      raise exception 'invalid translation object for locale %', v_locale;
    end if;

    v_body := v_translation->'body';
    v_takeaways := v_translation->'takeaways';

    if nullif(btrim(v_translation->>'category'), '') is null
       or nullif(btrim(v_translation->>'title'), '') is null
       or nullif(btrim(v_translation->>'dek'), '') is null
       or jsonb_typeof(v_body) <> 'array'
       or jsonb_array_length(v_body) < 3
       or jsonb_typeof(v_takeaways) <> 'array'
       or jsonb_array_length(v_takeaways) < 3 then
      raise exception 'incomplete translation for locale %', v_locale;
    end if;

    if exists (
      select 1 from jsonb_array_elements_text(v_body) as x(value)
      where nullif(btrim(x.value), '') is null
    ) or exists (
      select 1 from jsonb_array_elements_text(v_takeaways) as x(value)
      where nullif(btrim(x.value), '') is null
    ) then
      raise exception 'blank body or takeaway item for locale %', v_locale;
    end if;

    if v_revision_type = 'correction' then
      v_notice := nullif(btrim(v_notices->>v_locale), '');
      if v_notice is null then
        raise exception 'missing correction notice for locale %', v_locale;
      end if;
      if jsonb_array_length(v_body) = 0
         or v_body->>(jsonb_array_length(v_body) - 1) is distinct from v_notice then
        v_body := v_body || jsonb_build_array(v_notice);
      end if;
    end if;

    update public.article_translations as t
       set category = v_translation->>'category',
           title = v_translation->>'title',
           dek = v_translation->>'dek',
           body = v_body,
           takeaways = v_takeaways,
           updated_at = now()
     where t.article_slug = v_slug and t.locale = v_locale;

    if not found then
      raise exception 'stored translation not found for locale %', v_locale;
    end if;
  end loop;

  update public.articles as a
     set source_name = case when v_source_name_supplied then v_source_name else a.source_name end,
         source_url = case when v_source_url_supplied then v_source_url else a.source_url end,
         updated_at = now()
   where a.slug = v_slug;

  select to_jsonb(a)
    into v_article_after
  from public.articles as a
  where a.slug = v_slug;

  select jsonb_object_agg(
    t.locale,
    jsonb_build_object(
      'category', t.category,
      'title', t.title,
      'dek', t.dek,
      'body', t.body,
      'takeaways', t.takeaways,
      'updated_at', t.updated_at
    )
  )
  into v_translations_after
  from public.article_translations as t
  where t.article_slug = v_slug;

  select coalesce(max(r.revision_number), 0) + 1
    into v_revision
  from private.article_revision_log as r
  where r.article_slug = v_slug;

  insert into private.article_revision_log (
    article_slug, revision_number, revision_key, revision_type, reason,
    evidence_urls, visible_notices, article_before, article_after,
    translations_before, translations_after
  ) values (
    v_slug, v_revision, v_revision_key, v_revision_type, v_reason,
    v_evidence_urls, v_notices, v_article_before, v_article_after,
    v_translations_before, v_translations_after
  );

  return query select 'revised'::text, v_revision, v_slug;
end;
$$;

revoke all on function private.revise_published_article(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.revise_published_article(jsonb) to postgres;
