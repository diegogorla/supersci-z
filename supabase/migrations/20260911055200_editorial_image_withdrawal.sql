alter table public.articles add column image_withdrawn boolean not null default false;
comment on column public.articles.image_withdrawn is 'Owner-authorized editorial withdrawal: retain the original evidence and rights record, but omit the image from publication.';
grant select (image_withdrawn) on public.articles to anon, authenticated;

create or replace function public.get_published_article_index(p_limit integer default 100)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(article_payload order by publication_date desc, published_at desc), '[]'::jsonb)
  from (
    select a.publication_date, a.published_at,
      jsonb_build_object(
        'slug', a.slug,
        'date', a.publication_date,
        'readMinutes', a.read_minutes,
        'image', case when a.image_withdrawn then null else a.image_url end,
        'imageAlt', case when a.image_withdrawn then null else a.image_alt end,
        'imageCredit', case when a.image_withdrawn then null else a.image_credit end,
        'imageCreditUrl', case when a.image_withdrawn then null else a.image_credit_url end,
        'sourceName', a.source_name,
        'sourceUrl', a.source_url,
        'isDaily', a.is_daily,
        'topics', to_jsonb(a.topics),
        'copy', jsonb_object_agg(t.locale, jsonb_build_object(
          'category', t.category, 'title', t.title, 'dek', t.dek
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
