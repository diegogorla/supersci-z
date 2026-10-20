alter table public.articles
  drop constraint if exists articles_published_metadata_check,
  add constraint articles_published_metadata_check check (
    status <> 'published' or (
      publication_date is not null
      and read_minutes is not null
      and image_url is not null
      and char_length(image_alt) >= 2
      and char_length(image_credit) >= 2
      and image_credit_url is not null
      and image_rights_basis is not null
      and char_length(source_name) >= 2
      and source_url is not null
      and cardinality(topics) between 1 and 5
    )
  );

create or replace function private.publish_validated_daily_article(p_payload jsonb)
returns table (state text, article_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := p_payload->>'slug';
  v_run_date date;
  v_sources jsonb := p_payload->'sources';
  v_translations jsonb := p_payload->'translations';
  v_checks jsonb := p_payload->'checks';
  v_run_id uuid;
  v_existing_status text;
  v_existing_slug text;
  v_locale text;
  v_copy jsonb;
  v_source jsonb;
  v_required_locales constant text[] := array['pt','en','es','zh','hi','ja','ru'];
  v_failure text;
begin
  begin
    v_run_date := (p_payload->>'publicationDate')::date;
  exception when others then
    v_failure := 'invalid_publication_date';
  end;

  if v_run_date is not null then
    select id,status,article_slug into v_run_id,v_existing_status,v_existing_slug
    from public.editorial_runs where run_date=v_run_date;
    if v_existing_status='published' then
      return query select 'already_published',v_existing_slug;
      return;
    end if;
  end if;

  if v_failure is null and (v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then v_failure := 'invalid_slug'; end if;
  if v_failure is null and (v_run_date < current_date - 2 or v_run_date > current_date) then v_failure := 'stale_or_future_news'; end if;
  if v_failure is null and (
    coalesce(p_payload->>'readMinutes','') !~ '^[0-9]{1,2}$'
    or (p_payload->>'readMinutes')::integer not between 1 and 60
  ) then v_failure := 'invalid_reading_time'; end if;
  if v_failure is null and (jsonb_typeof(v_sources) <> 'array' or jsonb_array_length(v_sources) < 2) then v_failure := 'two_sources_required'; end if;
  if v_failure is null and (
    select count(distinct s->>'url') < 2 from jsonb_array_elements(v_sources) s
  ) then v_failure := 'two_distinct_sources_required'; end if;
  if v_failure is null and (
    jsonb_typeof(v_translations) <> 'object'
    or not (v_translations ?& v_required_locales)
    or jsonb_object_length(v_translations) <> 7
  ) then v_failure := 'seven_translations_required'; end if;
  if v_failure is null and (
    jsonb_typeof(v_checks) <> 'object'
    or coalesce((v_checks->>'factualConsistency')::boolean, false) is not true
    or coalesce((v_checks->>'sourceAttribution')::boolean, false) is not true
    or coalesce((v_checks->>'translationComplete')::boolean, false) is not true
    or coalesce((v_checks->>'imageRightsVerified')::boolean, false) is not true
    or coalesce((v_checks->>'noUnsupportedClaims')::boolean, false) is not true
  ) then v_failure := 'validation_checks_failed'; end if;
  if v_failure is null and (
    coalesce(p_payload->>'image','') !~ '^https://'
    or char_length(coalesce(p_payload->>'imageAlt','')) < 2
    or char_length(coalesce(p_payload->>'imageCredit','')) < 2
    or coalesce(p_payload->>'imageCreditUrl','') !~ '^https://'
    or coalesce(p_payload->>'sourceUrl','') !~ '^https://'
    or char_length(coalesce(p_payload->>'sourceName','')) < 2
    or coalesce(p_payload->>'imageRightsBasis','') not in ('public_domain','official_press_use','creative_commons','licensed')
  ) then v_failure := 'invalid_or_unlicensed_media'; end if;
  if v_failure is null and (
    jsonb_typeof(p_payload->'topics') <> 'array'
    or jsonb_array_length(p_payload->'topics') not between 1 and 5
    or exists (
      select 1 from jsonb_array_elements_text(p_payload->'topics') topic
      where topic not in ('language','mind','society','physics','cosmos')
    )
  ) then v_failure := 'invalid_topics'; end if;

  if v_failure is null then
    for v_source in select value from jsonb_array_elements(v_sources)
    loop
      if coalesce(v_source->>'url','') !~ '^https://'
        or char_length(coalesce(v_source->>'title','')) < 4
        or char_length(coalesce(v_source->>'publisher','')) < 2
        or coalesce(v_source->>'type','') not in ('primary','institutional','review','context')
        or coalesce(v_source->>'publishedAt','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' then
        v_failure := 'invalid_source'; exit;
      end if;
    end loop;
  end if;

  if v_failure is null and not exists (
    select 1 from jsonb_array_elements(v_sources) s
    where s->>'type' in ('primary','institutional')
  ) then v_failure := 'primary_or_institutional_source_required'; end if;
  if v_failure is null and not exists (
    select 1 from jsonb_array_elements(v_sources) s where s->>'url'=p_payload->>'sourceUrl'
  ) then v_failure := 'principal_source_not_in_evidence'; end if;
  if v_failure is null and (
    select count(*) < 2 from jsonb_array_elements(v_sources) s
    where (s->>'publishedAt')::timestamptz >= now()-interval '14 days'
      and (s->>'publishedAt')::timestamptz <= now()+interval '1 day'
  ) then v_failure := 'two_current_sources_required'; end if;

  if v_failure is null then
    foreach v_locale in array v_required_locales loop
      v_copy := v_translations->v_locale;
      if char_length(coalesce(v_copy->>'category','')) < 2
        or char_length(coalesce(v_copy->>'title','')) < 8
        or char_length(coalesce(v_copy->>'dek','')) < 20
        or jsonb_typeof(v_copy->'body') <> 'array'
        or jsonb_array_length(v_copy->'body') < 3
        or exists (select 1 from jsonb_array_elements(v_copy->'body') p where jsonb_typeof(p)<>'string' or char_length(p#>>'{}')<80)
        or jsonb_typeof(v_copy->'takeaways') <> 'array'
        or jsonb_array_length(v_copy->'takeaways') < 3
        or exists (select 1 from jsonb_array_elements(v_copy->'takeaways') p where jsonb_typeof(p)<>'string' or char_length(p#>>'{}')<10) then
        v_failure := 'incomplete_translation_' || v_locale; exit;
      end if;
    end loop;
  end if;

  if v_run_id is null then
    insert into public.editorial_runs(run_date,status,selected_sources,validation_checks,failure_reason,completed_at)
    values(coalesce(v_run_date,current_date),case when v_failure is null then 'researching' else 'quarantined' end,
      coalesce(v_sources,'[]'::jsonb),coalesce(v_checks,'{}'::jsonb),v_failure,
      case when v_failure is null then null else now() end)
    returning id into v_run_id;
  else
    update public.editorial_runs set
      status=case when v_failure is null then 'researching' else 'quarantined' end,
      selected_sources=coalesce(v_sources,'[]'::jsonb),validation_checks=coalesce(v_checks,'{}'::jsonb),
      failure_reason=v_failure,completed_at=case when v_failure is null then null else now() end
    where id=v_run_id;
  end if;

  if v_failure is not null then return query select 'quarantined',v_slug; return; end if;

  begin
    insert into public.articles(
      slug,status,published_at,publication_date,read_minutes,image_url,image_alt,image_credit,image_credit_url,
      image_rights_basis,source_name,source_url,is_daily,topics,updated_at
    ) values (
      v_slug,'draft',now(),v_run_date,(p_payload->>'readMinutes')::smallint,p_payload->>'image',p_payload->>'imageAlt',
      p_payload->>'imageCredit',p_payload->>'imageCreditUrl',p_payload->>'imageRightsBasis',p_payload->>'sourceName',
      p_payload->>'sourceUrl',true,array(select jsonb_array_elements_text(p_payload->'topics')),now()
    );

    foreach v_locale in array v_required_locales loop
      v_copy := v_translations->v_locale;
      insert into public.article_translations(article_slug,locale,category,title,dek,body,takeaways,updated_at)
      values(v_slug,v_locale,v_copy->>'category',v_copy->>'title',v_copy->>'dek',v_copy->'body',v_copy->'takeaways',now());
    end loop;

    for v_source in select value from jsonb_array_elements(v_sources)
    loop
      insert into public.article_sources(article_slug,source_type,publisher,title,url,published_at)
      values(v_slug,v_source->>'type',v_source->>'publisher',v_source->>'title',v_source->>'url',(v_source->>'publishedAt')::timestamptz);
    end loop;

    update public.articles set status='published',published_at=now(),updated_at=now() where slug=v_slug;
    update public.editorial_runs set status='published',article_slug=v_slug,failure_reason=null,completed_at=now() where id=v_run_id;
  exception when others then
    update public.editorial_runs set status='failed',failure_reason='database_validation_error',completed_at=now() where id=v_run_id;
    return query select 'failed',v_slug;
    return;
  end;

  return query select 'published',v_slug;
end;
$$;

revoke all on function private.publish_validated_daily_article(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.publish_validated_daily_article(jsonb) to service_role;

