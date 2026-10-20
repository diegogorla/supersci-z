drop policy if exists article_public_metadata_select on public.articles;
create policy article_public_metadata_select on public.articles
for select to anon,authenticated
using (status='published' and published_at<=now());

drop policy if exists article_translation_public_metadata_select on public.article_translations;
create policy article_translation_public_metadata_select on public.article_translations
for select to anon,authenticated
using (exists (
  select 1 from public.articles a
  where a.slug=article_slug and a.status='published' and a.published_at<=now()
));

grant select (
  slug,status,published_at,publication_date,read_minutes,image_url,image_alt,image_credit,image_credit_url,
  source_name,source_url,is_daily,topics
) on public.articles to anon,authenticated;
grant select (article_slug,locale,category,title,dek) on public.article_translations to anon,authenticated;

create or replace function public.get_published_article_index(p_limit integer default 100)
returns jsonb
language sql
stable
security invoker
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
    join public.article_translations t on t.article_slug=a.slug
    where a.status='published'
      and a.published_at<=now()
      and a.publication_date is not null
      and a.read_minutes is not null
      and a.image_url is not null
      and a.source_url is not null
      and t.category is not null
      and t.title is not null
      and t.dek is not null
    group by a.slug
    having count(*)=7
    order by a.publication_date desc,a.published_at desc
    limit greatest(1,least(coalesce(p_limit,100),500))
  ) indexed;
$$;

revoke all on function public.get_published_article_index(integer) from public,anon,authenticated,service_role;
grant execute on function public.get_published_article_index(integer) to anon,authenticated,service_role;

-- During the inaugural open-access phase this narrowly scoped function exposes
-- only one published article at a time. It is intentionally unavailable to the
-- authenticated role and is disabled atomically by private.platform_settings
-- before the paywall is enabled.
revoke execute on function public.get_open_article_content(text,text) from authenticated;

create index if not exists editorial_runs_article_slug_idx on public.editorial_runs(article_slug);

