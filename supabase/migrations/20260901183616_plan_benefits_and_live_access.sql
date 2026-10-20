-- Additive preparation for plan-aware access and member benefits.
-- Validated in a rolled-back transaction before promotion to migration history.

alter table public.household_members
  add column if not exists member_email_hint text,
  add column if not exists invite_token_hash text,
  add column if not exists accepted_at timestamptz,
  add column if not exists revoked_at timestamptz;

create unique index if not exists household_one_active_membership
  on public.household_members(accepted_user_id)
  where accepted_user_id is not null and status = 'active';

alter table public.access_devices
  add column if not exists label text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'access_devices_hash_format'
      and conrelid = 'public.access_devices'::regclass
  ) then
    alter table public.access_devices
      add constraint access_devices_hash_format
      check (device_hash ~ '^[a-f0-9]{64}$');
  end if;
end $$;

create table if not exists public.article_comments (
  id uuid primary key default gen_random_uuid(),
  article_slug text not null references public.articles(slug) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_display_name text not null check (char_length(author_display_name) between 1 and 80),
  body text not null check (char_length(body) between 3 and 1500),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists article_comments_public_idx
  on public.article_comments(article_slug, created_at)
  where status = 'published';
create index if not exists article_comments_user_created_idx
  on public.article_comments(user_id, created_at desc);

create table if not exists public.editorial_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 10 and 2000),
  priority boolean not null default false,
  status text not null default 'received' check (status in ('received', 'reviewing', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists editorial_questions_queue_idx
  on public.editorial_questions(priority desc, created_at)
  where status in ('received', 'reviewing');
create index if not exists editorial_questions_user_idx
  on public.editorial_questions(user_id, created_at desc);

alter table public.article_comments enable row level security;
alter table public.editorial_questions enable row level security;
revoke all on public.article_comments, public.editorial_questions from public, anon, authenticated;
grant select, insert, update, delete on public.article_comments, public.editorial_questions to service_role;

create or replace function private.resolve_effective_access(
  p_user_id uuid,
  p_provider_environment text
)
returns table(
  access_tier text,
  owner_user_id uuid,
  ads_enabled boolean,
  device_limit integer,
  household_slots integer,
  source text,
  valid_until timestamptz,
  provider_environment text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select
      e.access_tier,
      e.user_id as owner_user_id,
      e.ads_enabled,
      e.device_limit,
      e.household_slots,
      e.source,
      e.valid_until,
      e.provider_environment,
      case when e.access_tier in ('founder', 'cosmos', 'lifetime') then 1 else 3 end as priority
    from public.entitlements e
    where e.user_id = p_user_id
      and e.revoked_at is null
      and (e.valid_until is null or e.valid_until > now())
      and (e.provider_environment is null or e.provider_environment = p_provider_environment)

    union all

    select
      'cosmos'::text,
      e.user_id,
      false,
      e.device_limit,
      e.household_slots,
      'subscription'::text,
      e.valid_until,
      e.provider_environment,
      2
    from public.household_members h
    join public.entitlements e on e.user_id = h.owner_user_id
    where h.accepted_user_id = p_user_id
      and h.status = 'active'
      and h.revoked_at is null
      and e.access_tier = 'cosmos'
      and e.revoked_at is null
      and (e.valid_until is null or e.valid_until > now())
      and e.provider_environment = p_provider_environment
  )
  select c.access_tier, c.owner_user_id, c.ads_enabled, c.device_limit,
         c.household_slots, c.source, c.valid_until, c.provider_environment
  from candidates c
  order by c.priority
  limit 1;
$$;

create or replace function private.get_my_effective_access(p_provider_environment text)
returns table(
  access_tier text,
  owner_user_id uuid,
  ads_enabled boolean,
  device_limit integer,
  household_slots integer,
  source text,
  valid_until timestamptz,
  provider_environment text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_provider_environment not in ('sandbox', 'live') then raise exception 'invalid_environment'; end if;
  return query
    select * from private.resolve_effective_access(v_user_id, p_provider_environment);
  if not found then
    return query select 'free'::text, v_user_id, true, 1, 0,
      'signup'::text, null::timestamptz, null::text;
  end if;
end;
$$;

create or replace function public.get_my_effective_access(p_provider_environment text)
returns table(
  access_tier text,
  owner_user_id uuid,
  ads_enabled boolean,
  device_limit integer,
  household_slots integer,
  source text,
  valid_until timestamptz,
  provider_environment text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.get_my_effective_access(p_provider_environment);
$$;

create or replace function private.register_access_device(
  p_user_id uuid,
  p_device_hash text,
  p_device_label text,
  p_provider_environment text
)
returns table(allowed boolean, active_count integer, allowed_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access record;
  v_existing public.access_devices;
  v_active integer := 0;
begin
  if p_user_id is null or p_device_hash !~ '^[a-f0-9]{64}$' then
    return query select false, 0, 0;
    return;
  end if;
  if p_provider_environment not in ('sandbox', 'live') then raise exception 'invalid_environment'; end if;

  select * into v_access
    from private.resolve_effective_access(p_user_id, p_provider_environment);
  if v_access.access_tier is null or v_access.access_tier = 'free' then
    return query select true, 0, 0;
    return;
  end if;

  select * into v_existing
    from public.access_devices
    where user_id = p_user_id and device_hash = p_device_hash
    for update;
  if v_existing.id is not null and v_existing.revoked_at is null then
    update public.access_devices
      set last_seen_at = now(), label = left(nullif(trim(p_device_label), ''), 80)
      where id = v_existing.id;
    select count(*)::integer into v_active
      from public.access_devices d
      where d.revoked_at is null
        and (
          d.user_id = v_access.owner_user_id
          or d.user_id in (
            select h.accepted_user_id from public.household_members h
            where h.owner_user_id = v_access.owner_user_id
              and h.status = 'active' and h.revoked_at is null
              and h.accepted_user_id is not null
          )
        );
    return query select true, v_active, v_access.device_limit;
    return;
  end if;

  select count(*)::integer into v_active
    from public.access_devices d
    where d.revoked_at is null
      and (
        d.user_id = v_access.owner_user_id
        or d.user_id in (
          select h.accepted_user_id from public.household_members h
          where h.owner_user_id = v_access.owner_user_id
            and h.status = 'active' and h.revoked_at is null
            and h.accepted_user_id is not null
        )
      );
  if v_active >= v_access.device_limit then
    return query select false, v_active, v_access.device_limit;
    return;
  end if;

  insert into public.access_devices(user_id, device_hash, label, last_seen_at, revoked_at)
    values (p_user_id, p_device_hash, left(nullif(trim(p_device_label), ''), 80), now(), null)
    on conflict (user_id, device_hash) do update
      set label = excluded.label, last_seen_at = now(), revoked_at = null;
  return query select true, v_active + 1, v_access.device_limit;
end;
$$;

create or replace function private.get_my_reading_allowance_v2(p_provider_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cycle public.reading_cycles;
  v_access record;
  v_bonus_earned integer := 0;
begin
  if v_user_id is null then return 0; end if;
  if p_provider_environment not in ('sandbox', 'live') then raise exception 'invalid_environment'; end if;
  select * into v_access from private.resolve_effective_access(v_user_id, p_provider_environment);
  if v_access.access_tier in ('founder', 'cosmos', 'lifetime') then return 999999; end if;
  insert into public.reading_cycles(user_id) values (v_user_id) on conflict do nothing;
  select * into v_cycle from public.reading_cycles where user_id = v_user_id for update;
  if now() >= v_cycle.cycle_started_at + interval '30 days' then
    update public.reading_cycles
      set cycle_started_at = now(), base_reads_used = 0,
          base_quota_exhausted_at = null, bonus_reads_used = 0, updated_at = now()
      where user_id = v_user_id returning * into v_cycle;
  end if;
  if v_cycle.base_quota_exhausted_at is not null then
    v_bonus_earned := least(4, floor(greatest(0, extract(epoch from (now() - v_cycle.base_quota_exhausted_at))) / 604800)::integer);
  end if;
  return greatest(0, 6 - v_cycle.base_reads_used)
    + greatest(0, v_bonus_earned - v_cycle.bonus_reads_used);
end;
$$;

create or replace function public.get_my_reading_allowance_v2(p_provider_environment text)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.get_my_reading_allowance_v2(p_provider_environment);
$$;

create or replace function private.consume_article_access_v2(
  p_article_slug text,
  p_locale text,
  p_user_id uuid default null,
  p_reader_id uuid default null,
  p_provider_environment text default 'live',
  p_device_hash text default null,
  p_device_label text default null
)
returns table(
  allowed boolean,
  remaining integer,
  reason text,
  body jsonb,
  takeaways jsonb,
  access_tier text,
  shared_access boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.reading_cycles;
  v_body jsonb;
  v_takeaways jsonb;
  v_access record;
  v_device record;
  v_existing boolean := false;
  v_bonus_earned integer := 0;
  v_available integer := 0;
  v_legacy record;
begin
  if (p_user_id is null) = (p_reader_id is null) then
    return query select false, 0, 'invalid_identity', null::jsonb, null::jsonb, 'free'::text, false;
    return;
  end if;
  if p_provider_environment not in ('sandbox', 'live') then raise exception 'invalid_environment'; end if;

  select t.body, t.takeaways into v_body, v_takeaways
    from public.articles a
    join public.article_translations t on t.article_slug = a.slug
    where a.slug = p_article_slug and a.status = 'published' and t.locale = p_locale;
  if v_body is null then
    return query select false, 0, 'not_found', null::jsonb, null::jsonb, 'free'::text, false;
    return;
  end if;

  if p_user_id is null then
    select * into v_legacy
      from private.consume_article_access(p_article_slug, p_locale, null, p_reader_id);
    return query select v_legacy.allowed, v_legacy.remaining, v_legacy.reason,
      v_legacy.body, v_legacy.takeaways, 'free'::text, false;
    return;
  end if;

  if not exists (select 1 from public.reader_profiles where user_id = p_user_id) then
    return query select false, 0, 'profile_missing', null::jsonb, null::jsonb, 'free'::text, false;
    return;
  end if;
  select * into v_access from private.resolve_effective_access(p_user_id, p_provider_environment);

  if v_access.access_tier in ('founder', 'cosmos', 'lifetime') then
    select * into v_device from private.register_access_device(
      p_user_id, p_device_hash, p_device_label, p_provider_environment
    );
    if not coalesce(v_device.allowed, false) then
      return query select false, 0, 'device_limit', null::jsonb, null::jsonb,
        v_access.access_tier, v_access.owner_user_id <> p_user_id;
      return;
    end if;
    insert into public.reading_cycles(user_id) values (p_user_id) on conflict do nothing;
    select * into v_cycle from public.reading_cycles where user_id = p_user_id;
    insert into public.article_reads(user_id, article_slug, cycle_started_at)
      values (p_user_id, p_article_slug, v_cycle.cycle_started_at)
      on conflict do nothing;
    return query select true, 999999, 'unlimited', v_body, v_takeaways,
      v_access.access_tier, v_access.owner_user_id <> p_user_id;
    return;
  end if;

  insert into public.reading_cycles(user_id) values (p_user_id) on conflict do nothing;
  select * into v_cycle from public.reading_cycles where user_id = p_user_id for update;
  if now() >= v_cycle.cycle_started_at + interval '30 days' then
    update public.reading_cycles
      set cycle_started_at = now(), base_reads_used = 0,
          base_quota_exhausted_at = null, bonus_reads_used = 0, updated_at = now()
      where user_id = p_user_id returning * into v_cycle;
  end if;
  select exists(
    select 1 from public.article_reads r
    where r.user_id = p_user_id and r.article_slug = p_article_slug
      and r.cycle_started_at = v_cycle.cycle_started_at
  ) into v_existing;
  if v_cycle.base_quota_exhausted_at is not null then
    v_bonus_earned := least(4, floor(greatest(0, extract(epoch from (now() - v_cycle.base_quota_exhausted_at))) / 604800)::integer);
  end if;
  v_available := greatest(0, 6 - v_cycle.base_reads_used)
    + greatest(0, v_bonus_earned - v_cycle.bonus_reads_used);
  if v_existing then
    return query select true, v_available, 'already_counted', v_body, v_takeaways, 'free'::text, false;
    return;
  end if;
  if v_available <= 0 then
    return query select false, 0, 'quota_exhausted', null::jsonb, null::jsonb, 'free'::text, false;
    return;
  end if;
  insert into public.article_reads(user_id, article_slug, cycle_started_at)
    values (p_user_id, p_article_slug, v_cycle.cycle_started_at);
  if v_cycle.base_reads_used < 6 then
    update public.reading_cycles
      set base_reads_used = base_reads_used + 1,
          base_quota_exhausted_at = case when base_reads_used = 5 then now() else base_quota_exhausted_at end,
          updated_at = now()
      where user_id = p_user_id returning * into v_cycle;
  else
    update public.reading_cycles
      set bonus_reads_used = bonus_reads_used + 1, updated_at = now()
      where user_id = p_user_id returning * into v_cycle;
  end if;
  if v_cycle.base_quota_exhausted_at is not null then
    v_bonus_earned := least(4, floor(greatest(0, extract(epoch from (now() - v_cycle.base_quota_exhausted_at))) / 604800)::integer);
  end if;
  v_available := greatest(0, 6 - v_cycle.base_reads_used)
    + greatest(0, v_bonus_earned - v_cycle.bonus_reads_used);
  return query select true, v_available, 'counted', v_body, v_takeaways, 'free'::text, false;
end;
$$;

create or replace function public.consume_article_access_v2(
  p_article_slug text,
  p_locale text,
  p_user_id uuid default null,
  p_reader_id uuid default null,
  p_provider_environment text default 'live',
  p_device_hash text default null,
  p_device_label text default null
)
returns table(
  allowed boolean,
  remaining integer,
  reason text,
  body jsonb,
  takeaways jsonb,
  access_tier text,
  shared_access boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.consume_article_access_v2(
    p_article_slug, p_locale, p_user_id, p_reader_id,
    p_provider_environment, p_device_hash, p_device_label
  );
$$;

revoke all on function private.resolve_effective_access(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.get_my_effective_access(text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_effective_access(text) from public, anon, authenticated, service_role;
revoke all on function private.register_access_device(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.get_my_reading_allowance_v2(text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_reading_allowance_v2(text) from public, anon, authenticated, service_role;
revoke all on function private.consume_article_access_v2(text, text, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.consume_article_access_v2(text, text, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

grant usage on schema private to authenticated, service_role;
grant execute on function private.get_my_effective_access(text) to authenticated;
grant execute on function public.get_my_effective_access(text) to authenticated;
grant execute on function private.get_my_reading_allowance_v2(text) to authenticated;
grant execute on function public.get_my_reading_allowance_v2(text) to authenticated;
grant execute on function private.consume_article_access_v2(text, text, uuid, uuid, text, text, text) to service_role;
grant execute on function public.consume_article_access_v2(text, text, uuid, uuid, text, text, text) to service_role;
