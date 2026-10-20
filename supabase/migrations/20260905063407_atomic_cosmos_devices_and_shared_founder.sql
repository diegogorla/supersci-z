-- Serialize paid-device rotation and make Cosmos invitations atomic.
-- Shared Cosmos profiles receive Founder benefits; only the owner is ad-free.

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
      'founder'::text,
      e.user_id,
      true,
      1,
      0,
      'cosmos_share'::text,
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

create or replace function private.reconcile_cosmos_devices(
  p_owner_user_id uuid,
  p_provider_environment text
)
returns table(revoked_count integer, active_count integer, owner_allowed_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entitlement public.entitlements;
  v_member_count integer := 0;
  v_owner_allowed integer := 0;
  v_revoked integer := 0;
  v_changed integer := 0;
  v_active integer := 0;
begin
  if p_owner_user_id is null then
    return query select 0, 0, 0;
    return;
  end if;
  if p_provider_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ssz_access_group:' || p_owner_user_id::text, 0));

  select * into v_entitlement
    from public.entitlements e
    where e.user_id = p_owner_user_id
      and e.access_tier = 'cosmos'
      and e.revoked_at is null
      and (e.valid_until is null or e.valid_until > now())
      and e.provider_environment = p_provider_environment
    for update;

  if v_entitlement.user_id is null then
    return query select 0, 0, 0;
    return;
  end if;

  select count(*)::integer into v_member_count
    from public.household_members h
    where h.owner_user_id = p_owner_user_id
      and h.status = 'active'
      and h.revoked_at is null
      and h.accepted_user_id is not null;

  v_owner_allowed := greatest(1, v_entitlement.device_limit - v_member_count);

  with ranked as (
    select d.id,
           row_number() over (order by d.last_seen_at desc, d.created_at desc, d.id desc) as position
    from public.access_devices d
    where d.user_id = p_owner_user_id
      and d.revoked_at is null
  )
  update public.access_devices d
     set revoked_at = now()
    from ranked r
   where d.id = r.id
     and r.position > v_owner_allowed;
  get diagnostics v_changed = row_count;
  v_revoked := v_revoked + v_changed;

  with active_members as (
    select distinct h.accepted_user_id as user_id
    from public.household_members h
    where h.owner_user_id = p_owner_user_id
      and h.status = 'active'
      and h.revoked_at is null
      and h.accepted_user_id is not null
  ), ranked as (
    select d.id,
           row_number() over (
             partition by d.user_id
             order by d.last_seen_at desc, d.created_at desc, d.id desc
           ) as position
    from public.access_devices d
    join active_members m on m.user_id = d.user_id
    where d.revoked_at is null
  )
  update public.access_devices d
     set revoked_at = now()
    from ranked r
   where d.id = r.id
     and r.position > 1;
  get diagnostics v_changed = row_count;
  v_revoked := v_revoked + v_changed;

  select count(*)::integer into v_active
    from public.access_devices d
    where d.revoked_at is null
      and (
        d.user_id = p_owner_user_id
        or d.user_id in (
          select h.accepted_user_id
          from public.household_members h
          where h.owner_user_id = p_owner_user_id
            and h.status = 'active'
            and h.revoked_at is null
            and h.accepted_user_id is not null
        )
      );

  return query select v_revoked, v_active, v_owner_allowed;
end;
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
  v_personal_active integer := 0;
  v_group_active integer := 0;
  v_personal_limit integer := 1;
  v_member_count integer := 0;
begin
  if p_user_id is null or p_device_hash !~ '^[a-f0-9]{64}$' then
    return query select false, 0, 0;
    return;
  end if;
  if p_provider_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment';
  end if;

  select * into v_access
    from private.resolve_effective_access(p_user_id, p_provider_environment);
  if v_access.access_tier is null or v_access.access_tier = 'free' then
    return query select true, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ssz_access_group:' || v_access.owner_user_id::text, 0));
  select * into v_access
    from private.resolve_effective_access(p_user_id, p_provider_environment);
  if v_access.access_tier is null or v_access.access_tier = 'free' then
    return query select false, 0, 0;
    return;
  end if;

  if v_access.owner_user_id <> p_user_id then
    v_personal_limit := 1;
    perform 1 from private.reconcile_cosmos_devices(v_access.owner_user_id, p_provider_environment);
  elsif v_access.access_tier = 'cosmos' then
    select count(*)::integer into v_member_count
      from public.household_members h
      where h.owner_user_id = p_user_id
        and h.status = 'active'
        and h.revoked_at is null
        and h.accepted_user_id is not null;
    v_personal_limit := greatest(1, v_access.device_limit - v_member_count);
    perform 1 from private.reconcile_cosmos_devices(p_user_id, p_provider_environment);
  else
    v_personal_limit := greatest(1, v_access.device_limit);
  end if;

  select * into v_existing
    from public.access_devices d
    where d.user_id = p_user_id
      and d.device_hash = p_device_hash
    for update;

  if v_existing.id is not null and v_existing.revoked_at is null then
    update public.access_devices
       set last_seen_at = now(),
           label = left(nullif(trim(p_device_label), ''), 80)
     where id = v_existing.id;
  else
    select count(*)::integer into v_personal_active
      from public.access_devices d
      where d.user_id = p_user_id
        and d.revoked_at is null;

    if v_personal_active >= v_personal_limit then
      with oldest as (
        select d.id
        from public.access_devices d
        where d.user_id = p_user_id
          and d.revoked_at is null
        order by d.last_seen_at asc, d.created_at asc, d.id asc
        limit greatest(1, v_personal_active - v_personal_limit + 1)
        for update
      )
      update public.access_devices d
         set revoked_at = now()
        from oldest o
       where d.id = o.id;
    end if;

    insert into public.access_devices(user_id, device_hash, label, last_seen_at, revoked_at)
      values (p_user_id, p_device_hash, left(nullif(trim(p_device_label), ''), 80), now(), null)
      on conflict (user_id, device_hash) do update
        set label = excluded.label,
            last_seen_at = now(),
            revoked_at = null;
  end if;

  if v_access.access_tier = 'cosmos' or v_access.owner_user_id <> p_user_id then
    select count(*)::integer into v_group_active
      from public.access_devices d
      where d.revoked_at is null
        and (
          d.user_id = v_access.owner_user_id
          or d.user_id in (
            select h.accepted_user_id
            from public.household_members h
            where h.owner_user_id = v_access.owner_user_id
              and h.status = 'active'
              and h.revoked_at is null
              and h.accepted_user_id is not null
          )
        );
    return query select true, v_group_active, 3;
  else
    select count(*)::integer into v_personal_active
      from public.access_devices d
      where d.user_id = p_user_id
        and d.revoked_at is null;
    return query select true, v_personal_active, v_personal_limit;
  end if;
end;
$$;

create or replace function private.create_cosmos_invite(
  p_owner_user_id uuid,
  p_member_email_hash text,
  p_member_email_hint text,
  p_invite_token_hash text,
  p_provider_environment text
)
returns table(state text, member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entitlement public.entitlements;
  v_existing public.household_members;
  v_slots_used integer := 0;
  v_member_id uuid;
begin
  if p_owner_user_id is null
     or p_member_email_hash !~ '^[a-f0-9]{64}$'
     or p_invite_token_hash !~ '^[a-f0-9]{64}$' then
    return query select 'invalid_input'::text, null::uuid;
    return;
  end if;
  if p_provider_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ssz_access_group:' || p_owner_user_id::text, 0));

  select * into v_entitlement
    from public.entitlements e
    where e.user_id = p_owner_user_id
      and e.access_tier = 'cosmos'
      and e.revoked_at is null
      and (e.valid_until is null or e.valid_until > now())
      and e.provider_environment = p_provider_environment
    for update;
  if v_entitlement.user_id is null then
    return query select 'cosmos_owner_required'::text, null::uuid;
    return;
  end if;

  select * into v_existing
    from public.household_members h
    where h.owner_user_id = p_owner_user_id
      and h.member_email_hash = p_member_email_hash
    for update;
  if v_existing.id is not null and v_existing.status = 'active' and v_existing.revoked_at is null then
    return query select 'already_active'::text, v_existing.id;
    return;
  end if;

  select count(*)::integer into v_slots_used
    from public.household_members h
    where h.owner_user_id = p_owner_user_id
      and h.status in ('invited', 'active')
      and h.revoked_at is null
      and (v_existing.id is null or h.id <> v_existing.id);
  if v_slots_used >= v_entitlement.household_slots then
    return query select 'slot_limit'::text, null::uuid;
    return;
  end if;

  insert into public.household_members(
    owner_user_id, member_email_hash, member_email_hint, invite_token_hash,
    accepted_user_id, accepted_at, revoked_at, status
  ) values (
    p_owner_user_id, p_member_email_hash, left(nullif(trim(p_member_email_hint), ''), 254),
    p_invite_token_hash, null, null, null, 'invited'
  )
  on conflict (owner_user_id, member_email_hash) do update
    set member_email_hint = excluded.member_email_hint,
        invite_token_hash = excluded.invite_token_hash,
        accepted_user_id = null,
        accepted_at = null,
        revoked_at = null,
        status = 'invited'
  returning id into v_member_id;

  return query select 'invited'::text, v_member_id;
end;
$$;

create or replace function private.accept_cosmos_invite(
  p_invite_token_hash text,
  p_member_email_hash text,
  p_accepted_user_id uuid,
  p_provider_environment text
)
returns table(state text, member_id uuid, revoked_device_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_user_id uuid;
  v_invite public.household_members;
  v_entitlement public.entitlements;
  v_active_members integer := 0;
  v_reconciliation record;
begin
  if p_accepted_user_id is null
     or p_member_email_hash !~ '^[a-f0-9]{64}$'
     or p_invite_token_hash !~ '^[a-f0-9]{64}$' then
    return query select 'invite_not_found'::text, null::uuid, 0;
    return;
  end if;
  if p_provider_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment';
  end if;

  select h.owner_user_id into v_owner_user_id
    from public.household_members h
    where h.invite_token_hash = p_invite_token_hash
      and h.status = 'invited'
      and h.revoked_at is null;
  if v_owner_user_id is null or v_owner_user_id = p_accepted_user_id then
    return query select 'invite_not_found'::text, null::uuid, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ssz_access_group:' || v_owner_user_id::text, 0));

  select * into v_invite
    from public.household_members h
    where h.invite_token_hash = p_invite_token_hash
      and h.owner_user_id = v_owner_user_id
      and h.status = 'invited'
      and h.revoked_at is null
    for update;
  if v_invite.id is null or v_invite.member_email_hash <> p_member_email_hash then
    return query select 'invite_not_found'::text, null::uuid, 0;
    return;
  end if;

  if exists (
    select 1
    from public.household_members h
    where h.accepted_user_id = p_accepted_user_id
      and h.status = 'active'
      and h.revoked_at is null
  ) then
    return query select 'already_in_household'::text, null::uuid, 0;
    return;
  end if;

  select * into v_entitlement
    from public.entitlements e
    where e.user_id = v_owner_user_id
      and e.access_tier = 'cosmos'
      and e.revoked_at is null
      and (e.valid_until is null or e.valid_until > now())
      and e.provider_environment = p_provider_environment
    for update;
  if v_entitlement.user_id is null then
    return query select 'invite_inactive'::text, v_invite.id, 0;
    return;
  end if;

  select count(*)::integer into v_active_members
    from public.household_members h
    where h.owner_user_id = v_owner_user_id
      and h.status = 'active'
      and h.revoked_at is null
      and h.accepted_user_id is not null;
  if v_active_members >= v_entitlement.household_slots then
    return query select 'slot_limit'::text, v_invite.id, 0;
    return;
  end if;

  update public.household_members
     set accepted_user_id = p_accepted_user_id,
         accepted_at = now(),
         status = 'active',
         invite_token_hash = null,
         revoked_at = null
   where id = v_invite.id;

  select * into v_reconciliation
    from private.reconcile_cosmos_devices(v_owner_user_id, p_provider_environment);

  return query select 'accepted'::text, v_invite.id,
    coalesce(v_reconciliation.revoked_count, 0)::integer;
exception
  when unique_violation then
    return query select 'already_in_household'::text, null::uuid, 0;
end;
$$;

create or replace function private.revoke_cosmos_member(
  p_owner_user_id uuid,
  p_member_id uuid,
  p_provider_environment text
)
returns table(state text, revoked_device_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.household_members;
  v_revoked integer := 0;
begin
  if p_owner_user_id is null or p_member_id is null then
    return query select 'not_found'::text, 0;
    return;
  end if;
  if p_provider_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ssz_access_group:' || p_owner_user_id::text, 0));

  if not exists (
    select 1
    from public.entitlements e
    where e.user_id = p_owner_user_id
      and e.access_tier = 'cosmos'
      and e.revoked_at is null
      and (e.valid_until is null or e.valid_until > now())
      and e.provider_environment = p_provider_environment
  ) then
    return query select 'cosmos_owner_required'::text, 0;
    return;
  end if;

  select * into v_member
    from public.household_members h
    where h.id = p_member_id
      and h.owner_user_id = p_owner_user_id
      and h.status in ('invited', 'active')
      and h.revoked_at is null
    for update;
  if v_member.id is null then
    return query select 'not_found'::text, 0;
    return;
  end if;

  update public.household_members
     set status = 'revoked',
         revoked_at = now(),
         invite_token_hash = null
   where id = v_member.id;

  if v_member.accepted_user_id is not null then
    update public.access_devices
       set revoked_at = now()
     where user_id = v_member.accepted_user_id
       and revoked_at is null;
    get diagnostics v_revoked = row_count;
  end if;

  return query select 'revoked'::text, v_revoked;
end;
$$;

create or replace function public.create_cosmos_invite(
  p_owner_user_id uuid,
  p_member_email_hash text,
  p_member_email_hint text,
  p_invite_token_hash text,
  p_provider_environment text
)
returns table(state text, member_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_cosmos_invite(
    p_owner_user_id, p_member_email_hash, p_member_email_hint,
    p_invite_token_hash, p_provider_environment
  );
$$;

create or replace function public.accept_cosmos_invite(
  p_invite_token_hash text,
  p_member_email_hash text,
  p_accepted_user_id uuid,
  p_provider_environment text
)
returns table(state text, member_id uuid, revoked_device_count integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.accept_cosmos_invite(
    p_invite_token_hash, p_member_email_hash, p_accepted_user_id, p_provider_environment
  );
$$;

create or replace function public.revoke_cosmos_member(
  p_owner_user_id uuid,
  p_member_id uuid,
  p_provider_environment text
)
returns table(state text, revoked_device_count integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.revoke_cosmos_member(
    p_owner_user_id, p_member_id, p_provider_environment
  );
$$;

-- A future-dated article must remain unavailable even if its slug is known.
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
    where a.slug = p_article_slug
      and a.status = 'published'
      and a.published_at is not null
      and a.published_at <= now()
      and t.locale = p_locale;
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

revoke all on function private.resolve_effective_access(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.reconcile_cosmos_devices(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.register_access_device(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.create_cosmos_invite(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.accept_cosmos_invite(text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.revoke_cosmos_member(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_cosmos_invite(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.accept_cosmos_invite(text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_cosmos_member(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.consume_article_access_v2(text, text, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

grant usage on schema private to service_role;
grant execute on function private.reconcile_cosmos_devices(uuid, text) to service_role;
grant execute on function private.register_access_device(uuid, text, text, text) to service_role;
grant execute on function private.create_cosmos_invite(uuid, text, text, text, text) to service_role;
grant execute on function private.accept_cosmos_invite(text, text, uuid, text) to service_role;
grant execute on function private.revoke_cosmos_member(uuid, uuid, text) to service_role;
grant execute on function public.create_cosmos_invite(uuid, text, text, text, text) to service_role;
grant execute on function public.accept_cosmos_invite(text, text, uuid, text) to service_role;
grant execute on function public.revoke_cosmos_member(uuid, uuid, text) to service_role;
grant execute on function private.consume_article_access_v2(text, text, uuid, uuid, text, text, text) to service_role;
