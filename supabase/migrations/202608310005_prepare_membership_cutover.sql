-- Final one-way cutover from the inaugural open edition to metered access.
--
-- Do not apply this migration until SUPABASE_SECRET_KEY and
-- READER_COOKIE_SECRET are configured in the production worker and the
-- membership runtime has passed its preflight checks. Once applied, the
-- browser-facing open-content RPC no longer returns or exposes full articles.

begin;

-- Sandbox purchases prove the integration but can never buy production access.
-- Keep their billing history for audit while revoking the corresponding benefit
-- before the live meter becomes authoritative.
update public.entitlements
set revoked_at = coalesce(revoked_at, now()),
    updated_at = now()
where provider_environment = 'sandbox';

update private.platform_settings
set open_content_access = false,
    updated_at = now()
where singleton;

do $$
begin
  if not exists (
    select 1
    from private.platform_settings
    where singleton and open_content_access = false
  ) then
    raise exception 'membership_cutover_not_persisted';
  end if;
  if exists (
    select 1
    from public.entitlements
    where provider_environment = 'sandbox'
      and revoked_at is null
      and (valid_until is null or valid_until > now())
  ) then
    raise exception 'active_sandbox_entitlement_at_live_cutover';
  end if;
end;
$$;

-- The schema is not exposed through the Data API and all direct grants were
-- already revoked. RLS remains useful as defence in depth for future changes.
alter table private.platform_settings enable row level security;
revoke all on private.platform_settings from public, anon, authenticated, service_role;

revoke all on function public.get_open_article_content(text, text)
  from public, anon, authenticated, service_role;

comment on function public.get_open_article_content(text, text) is
  'Retained for audit; no browser or server role may execute it after membership cutover.';

-- A production incident can disable MEMBERSHIP_ENABLED immediately without
-- making the magazine empty. Only the backend service role can use this narrow
-- emergency path; article bodies remain inaccessible to browser credentials.
create or replace function public.get_server_open_article_content(p_article_slug text, p_locale text)
returns table (body jsonb, takeaways jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select t.body, t.takeaways
  from public.article_translations t
  join public.articles a on a.slug = t.article_slug
  where a.slug = p_article_slug
    and a.status = 'published'
    and a.published_at <= now()
    and t.locale = p_locale
    and p_article_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and p_locale in ('pt','en','es','zh','hi','ja','ru')
  limit 1;
$$;

revoke all on function public.get_server_open_article_content(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_server_open_article_content(text, text)
  to service_role;

comment on function public.get_server_open_article_content(text, text) is
  'Emergency server-only open access after membership cutover; never grant to browser roles.';

commit;
