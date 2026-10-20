-- Catálogo editorial dinâmico e publicação automática validada.
-- O corpo integral continua fechado nas tabelas; somente funções com retorno
-- estritamente definido podem expor metadados públicos ou o modo inaugural aberto.

alter table public.articles
  add column if not exists publication_date date,
  add column if not exists read_minutes smallint,
  add column if not exists image_url text,
  add column if not exists image_alt text,
  add column if not exists image_credit text,
  add column if not exists image_credit_url text,
  add column if not exists image_rights_basis text,
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists is_daily boolean not null default false,
  add column if not exists topics text[] not null default '{}';

alter table public.articles
  drop constraint if exists articles_read_minutes_check,
  add constraint articles_read_minutes_check check (read_minutes is null or read_minutes between 1 and 60),
  drop constraint if exists articles_image_url_check,
  add constraint articles_image_url_check check (image_url is null or image_url ~ '^https://'),
  drop constraint if exists articles_image_credit_url_check,
  add constraint articles_image_credit_url_check check (image_credit_url is null or image_credit_url ~ '^https://'),
  drop constraint if exists articles_source_url_check,
  add constraint articles_source_url_check check (source_url is null or source_url ~ '^https://'),
  drop constraint if exists articles_image_rights_basis_check,
  add constraint articles_image_rights_basis_check check (
    image_rights_basis is null or image_rights_basis in ('public_domain','official_press_use','creative_commons','licensed')
  ),
  drop constraint if exists articles_topics_check,
  add constraint articles_topics_check check (
    topics <@ array['language','mind','society','physics','cosmos']::text[]
    and cardinality(topics) between 0 and 5
  );

alter table public.article_translations
  add column if not exists category text,
  add column if not exists title text,
  add column if not exists dek text;

create table if not exists public.editorial_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,
  status text not null check (status in ('researching','quarantined','published','failed')),
  selected_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_sources) = 'array'),
  validation_checks jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_checks) = 'object'),
  article_slug text references public.articles(slug) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.article_sources (
  id uuid primary key default gen_random_uuid(),
  article_slug text not null references public.articles(slug) on delete cascade,
  source_type text not null check (source_type in ('primary','institutional','review','context')),
  publisher text not null check (char_length(publisher) between 2 and 160),
  title text not null check (char_length(title) between 4 and 300),
  url text not null check (url ~ '^https://'),
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  unique (article_slug, url)
);

alter table public.editorial_runs enable row level security;
alter table public.article_sources enable row level security;
revoke all on public.editorial_runs, public.article_sources from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.editorial_runs, public.article_sources to service_role;

create or replace function public.get_published_article_index(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(article_payload order by publication_date desc, published_at desc), '[]'::jsonb)
  from (
    select
      a.publication_date,
      a.published_at,
      jsonb_build_object(
        'slug', a.slug,
        'date', a.publication_date,
        'readMinutes', a.read_minutes,
        'image', a.image_url,
        'imageAlt', a.image_alt,
        'imageCredit', a.image_credit,
        'imageCreditUrl', a.image_credit_url,
        'sourceName', a.source_name,
        'sourceUrl', a.source_url,
        'isDaily', a.is_daily,
        'topics', to_jsonb(a.topics),
        'copy', jsonb_object_agg(t.locale, jsonb_build_object(
          'category', t.category,
          'title', t.title,
          'dek', t.dek
        ))
      ) as article_payload
    from public.articles a
    join public.article_translations t on t.article_slug = a.slug
    where a.status = 'published'
      and a.published_at <= now()
      and a.publication_date is not null
      and a.read_minutes is not null
      and a.image_url is not null
      and a.source_url is not null
      and t.category is not null
      and t.title is not null
      and t.dek is not null
    group by a.slug
    having count(*) = 7
    order by a.publication_date desc, a.published_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) indexed;
$$;

create table if not exists private.platform_settings (
  singleton boolean primary key default true check (singleton),
  open_content_access boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into private.platform_settings(singleton, open_content_access)
values (true, true)
on conflict (singleton) do nothing;
revoke all on private.platform_settings from public, anon, authenticated, service_role;

create or replace function public.get_open_article_content(p_article_slug text, p_locale text)
returns table (body jsonb, takeaways jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select t.body, t.takeaways
  from public.article_translations t
  join public.articles a on a.slug = t.article_slug
  where (select s.open_content_access from private.platform_settings s where s.singleton)
    and a.slug = p_article_slug
    and a.status = 'published'
    and a.published_at <= now()
    and t.locale = p_locale
    and p_article_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and p_locale in ('pt','en','es','zh','hi','ja','ru')
  limit 1;
$$;

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

  if v_failure is null and (v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then v_failure := 'invalid_slug'; end if;
  if v_failure is null and (v_run_date < current_date - 2 or v_run_date > current_date) then v_failure := 'stale_or_future_news'; end if;
  if v_failure is null and (jsonb_typeof(v_sources) <> 'array' or jsonb_array_length(v_sources) < 2) then v_failure := 'two_sources_required'; end if;
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
    p_payload->>'image' !~ '^https://'
    or p_payload->>'imageCreditUrl' !~ '^https://'
    or p_payload->>'sourceUrl' !~ '^https://'
    or p_payload->>'imageRightsBasis' not in ('public_domain','official_press_use','creative_commons','licensed')
  ) then v_failure := 'invalid_or_unlicensed_media'; end if;
  if v_failure is null and (
    jsonb_typeof(p_payload->'topics') <> 'array'
    or jsonb_array_length(p_payload->'topics') < 1
  ) then v_failure := 'topics_required'; end if;

  if v_failure is null then
    for v_source in select value from jsonb_array_elements(v_sources)
    loop
      if v_source->>'url' !~ '^https://' or char_length(coalesce(v_source->>'title','')) < 4
        or char_length(coalesce(v_source->>'publisher','')) < 2
        or v_source->>'type' not in ('primary','institutional','review','context') then
        v_failure := 'invalid_source'; exit;
      end if;
    end loop;
  end if;

  if v_failure is null and not exists (
    select 1 from jsonb_array_elements(v_sources) s where s->>'type' in ('primary','institutional')
  ) then v_failure := 'primary_or_institutional_source_required'; end if;

  if v_failure is null then
    foreach v_locale in array v_required_locales loop
      v_copy := v_translations->v_locale;
      if char_length(coalesce(v_copy->>'category','')) < 2
        or char_length(coalesce(v_copy->>'title','')) < 8
        or char_length(coalesce(v_copy->>'dek','')) < 20
        or jsonb_typeof(v_copy->'body') <> 'array'
        or jsonb_array_length(v_copy->'body') < 3
        or jsonb_typeof(v_copy->'takeaways') <> 'array'
        or jsonb_array_length(v_copy->'takeaways') < 3 then
        v_failure := 'incomplete_translation_' || v_locale; exit;
      end if;
    end loop;
  end if;

  insert into public.editorial_runs(run_date,status,selected_sources,validation_checks,failure_reason,completed_at)
  values (coalesce(v_run_date,current_date), case when v_failure is null then 'researching' else 'quarantined' end,
    coalesce(v_sources,'[]'::jsonb), coalesce(v_checks,'{}'::jsonb), v_failure,
    case when v_failure is null then null else now() end)
  on conflict (run_date) do update set
    status = excluded.status,
    selected_sources = excluded.selected_sources,
    validation_checks = excluded.validation_checks,
    failure_reason = excluded.failure_reason,
    completed_at = excluded.completed_at
  returning id into v_run_id;

  if v_failure is not null then return query select 'quarantined', v_slug; return; end if;

  insert into public.articles(
    slug,status,published_at,publication_date,read_minutes,image_url,image_alt,image_credit,image_credit_url,
    image_rights_basis,source_name,source_url,is_daily,topics,updated_at
  ) values (
    v_slug,'published',now(),v_run_date,(p_payload->>'readMinutes')::smallint,p_payload->>'image',p_payload->>'imageAlt',
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
    values(v_slug,v_source->>'type',v_source->>'publisher',v_source->>'title',v_source->>'url',nullif(v_source->>'publishedAt','')::timestamptz);
  end loop;

  update public.editorial_runs set status='published',article_slug=v_slug,failure_reason=null,completed_at=now() where id=v_run_id;
  return query select 'published', v_slug;
exception
  when unique_violation then
    update public.editorial_runs set status='quarantined',failure_reason='duplicate_slug_or_source',completed_at=now() where id=v_run_id;
    return query select 'quarantined', v_slug;
  when others then
    if v_run_id is not null then
      update public.editorial_runs set status='failed',failure_reason='database_validation_error',completed_at=now() where id=v_run_id;
    end if;
    raise;
end;
$$;

revoke all on function public.get_published_article_index(integer) from public, anon, authenticated, service_role;
revoke all on function public.get_open_article_content(text,text) from public, anon, authenticated, service_role;
revoke all on function private.publish_validated_daily_article(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.get_published_article_index(integer) to anon, authenticated, service_role;
grant execute on function public.get_open_article_content(text,text) to anon, authenticated, service_role;
grant execute on function private.publish_validated_daily_article(jsonb) to service_role;
