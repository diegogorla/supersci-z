begin;
-- catalog-and-checkout-guard.sql
-- Review artifact: generate a real migration filename before integrating.
-- Does not enable membership or perform any Paddle API operation.

create table if not exists private.paddle_price_catalog (
  provider_environment text not null check (provider_environment in ('sandbox','live')),
  price_id text not null check (price_id ~ '^pri_[a-z0-9]{26}$'),
  plan_code text not null check (plan_code in ('founder_monthly','founder_annual','cosmos_monthly','cosmos_annual','lifetime')),
  billing_kind text not null check (billing_kind in ('recurring','one_time')),
  active boolean not null default true,
  primary key(provider_environment,price_id)
);
alter table private.paddle_price_catalog enable row level security;
revoke all on private.paddle_price_catalog from public,anon,authenticated,service_role;

-- Public price identifiers confirmed from the configured production catalog.
-- Credentials are deliberately absent from this migration.
insert into private.paddle_price_catalog(provider_environment,price_id,plan_code,billing_kind) values
('live','pri_01m1fp34hpzwcbcjgxdgqce6tz','founder_monthly','recurring'),
('live','pri_01m1fp3pw4vbe8zz4q95vapkad','founder_annual','recurring'),
('live','pri_01m1fp4jvgt0rb5ffevttp8kpa','founder_annual','one_time'),
('live','pri_01m1fp66xgg67er42c88d1qaqh','cosmos_monthly','recurring'),
('live','pri_01m1fp6m8fa8b55eej9ev85zad','cosmos_annual','recurring'),
('live','pri_01m1fp74e7t80q8atbdx4xqyg6','lifetime','one_time'),
('sandbox','pri_01m16hgv34xvf41trhvbc6qmnd','founder_monthly','recurring'),
('sandbox','pri_01m16hgwgebe8bm8y0trz4dns5','founder_annual','recurring'),
('sandbox','pri_01m16hgthwe5jt5v3e01hqpq92','founder_annual','one_time'),
('sandbox','pri_01m16hgv6wfw094hs358yjxt5g','cosmos_monthly','recurring'),
('sandbox','pri_01m16hgvrxq6c14s9erb1pxfym','cosmos_annual','recurring'),
('sandbox','pri_01m16hgvk7fd5zc5ytbwpf33qq','lifetime','one_time')
on conflict(provider_environment,price_id) do update
set plan_code=excluded.plan_code,billing_kind=excluded.billing_kind,active=true;

-- Old authenticated RPCs accepted arbitrary combinations of plan and price.
-- Revoke every overload in both exposed and private schemas, including legacy.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname='create_checkout_intent'
  loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); end loop;
end $$;

create or replace function private.create_checkout_intent_for_user(
  p_user_id uuid,p_plan_code text,p_price_id text,p_provider_environment text
) returns table(intent_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_existing public.checkout_intents;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'authentication_required';
  end if;
  if not exists(select 1 from private.paddle_price_catalog c
    where c.provider_environment=p_provider_environment and c.price_id=p_price_id
      and c.plan_code=p_plan_code and c.active) then raise exception 'invalid_catalog_price'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ssz_billing:'||p_user_id::text||':'||p_provider_environment,0));
  if exists(select 1 from public.account_deletion_requests d
      where d.user_id=p_user_id and d.status in ('pending','ready')) then raise exception 'account_deletion_pending'; end if;
  if exists(select 1 from public.subscriptions s where s.user_id=p_user_id
    and s.provider_environment=p_provider_environment
    and s.status in ('trialing','active','past_due','paused')
    and (s.provider_subscription_id is not null or s.current_period_end is null or s.current_period_end>now())) then
    raise exception 'already_subscribed';
  end if;
  update public.checkout_intents c set status='expired',updated_at=now()
    where c.user_id=p_user_id and c.provider_environment=p_provider_environment
      and c.status='pending' and c.expires_at<=now();
  select * into v_existing from public.checkout_intents c
    where c.user_id=p_user_id and c.provider_environment=p_provider_environment
      and c.status='pending' and c.expires_at>now()
    order by c.created_at desc limit 1 for update;
  if v_existing.id is not null then
    if v_existing.plan_code<>p_plan_code or v_existing.price_id<>p_price_id then
      raise exception 'checkout_in_progress';
    end if;
    return query select v_existing.id,v_existing.expires_at; return;
  end if;
  return query insert into public.checkout_intents(user_id,plan_code,price_id,provider_environment)
    values(p_user_id,p_plan_code,p_price_id,p_provider_environment)
    returning public.checkout_intents.id,public.checkout_intents.expires_at;
end $$;

create or replace function public.create_checkout_intent_for_user(
  p_user_id uuid,p_plan_code text,p_price_id text,p_provider_environment text
) returns table(intent_id uuid,expires_at timestamptz)
language sql security invoker set search_path='' as $$
  select * from private.create_checkout_intent_for_user(p_user_id,p_plan_code,p_price_id,p_provider_environment);
$$;
revoke all on function private.create_checkout_intent_for_user(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.create_checkout_intent_for_user(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.create_checkout_intent_for_user(uuid,text,text,text) to service_role;
grant execute on function public.create_checkout_intent_for_user(uuid,text,text,text) to service_role;

-- Fail closed at webhook processing as well, so legacy or tampered intents
-- cannot grant a different tier even if a real payment carries their reference.
create or replace function private.validate_paddle_catalog_event(
  p_provider_environment text,p_event_type text,p_checkout_reference uuid,p_price_id text,
  p_provider_subscription_id text,p_provider_transaction_id text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare c private.paddle_price_catalog; i public.checkout_intents; s public.subscriptions; v_user_id uuid;
begin
  if p_provider_environment is null or p_provider_environment not in ('sandbox','live') then raise exception 'invalid_environment'; end if;
  if p_event_type not in ('transaction.completed','subscription.created','subscription.trialing',
    'subscription.activated','subscription.updated','subscription.past_due',
    'subscription.paused','subscription.resumed','subscription.canceled') then return null; end if;
  select * into c from private.paddle_price_catalog pc
    where pc.provider_environment=p_provider_environment and pc.price_id=p_price_id and pc.active;
  if c.price_id is null then raise exception 'invalid_catalog_price'; end if;
  if c.billing_kind='one_time' and (p_provider_subscription_id is not null or p_event_type<>'transaction.completed') then
    raise exception 'billing_kind_mismatch';
  end if;
  if c.billing_kind='recurring' and p_provider_subscription_id is null then raise exception 'billing_kind_mismatch'; end if;
  if p_checkout_reference is not null then
    select * into i from public.checkout_intents ci where ci.id=p_checkout_reference;
    if i.id is null or i.provider_environment<>p_provider_environment or i.price_id<>c.price_id or i.plan_code<>c.plan_code then
      raise exception 'checkout_catalog_mismatch';
    end if;
  end if;
  select * into s from public.subscriptions ps where ps.provider='paddle'
    and ((p_provider_subscription_id is not null and ps.provider_subscription_id=p_provider_subscription_id)
      or (p_provider_transaction_id is not null and ps.provider_transaction_id=p_provider_transaction_id))
    limit 1;
  if s.id is not null then
    if s.provider_environment<>p_provider_environment or s.plan_code<>c.plan_code
      or (i.id is not null and i.user_id is distinct from s.user_id) then raise exception 'subscription_catalog_mismatch'; end if;
    v_user_id:=s.user_id;
  else
    if i.id is null or i.status='expired' or (i.status='pending' and i.expires_at<=now()) then raise exception 'invalid_checkout_reference'; end if;
    v_user_id:=i.user_id;
  end if;
  if v_user_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('ssz_billing:'||v_user_id::text||':'||p_provider_environment,0));
  if s.id is null and exists(select 1 from public.subscriptions ps where ps.user_id=v_user_id
    and ps.provider_environment=p_provider_environment and ps.status in ('trialing','active','past_due','paused')
    and (ps.provider_subscription_id is not null or ps.current_period_end is null or ps.current_period_end>now())
    and (p_provider_subscription_id is null or ps.provider_subscription_id is distinct from p_provider_subscription_id)
    and (p_provider_transaction_id is null or ps.provider_transaction_id is distinct from p_provider_transaction_id)) then
    raise exception 'duplicate_active_subscription';
  end if;
  return v_user_id;
end $$;
revoke all on function private.validate_paddle_catalog_event(text,text,uuid,text,text,text) from public,anon,authenticated,service_role;

create or replace function webhook_private.process_paddle_event_from_webhook(
  p_provider_environment text,p_webhook_secret text,p_event_id text,p_event_type text,
  p_occurred_at timestamptz,p_payload_sha256 text,p_checkout_reference uuid,p_price_id text,
  p_provider_customer_id text,p_provider_subscription_id text,p_provider_transaction_id text,
  p_subscription_status text,p_trial_ends_at timestamptz,p_current_period_end timestamptz,p_cancel_at_period_end boolean
) returns table(state text,affected_user_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_expected_secret text; v_state text; v_user_id uuid; v_live_entitlement public.entitlements; v_preserve_live boolean:=false;
begin
  if p_provider_environment is null or p_provider_environment not in ('sandbox','live') then raise exception 'invalid_environment'; end if;
  select decrypted_secret into v_expected_secret from vault.decrypted_secrets
    where name='paddle_'||p_provider_environment||'_webhook_secret' limit 1;
  if v_expected_secret is null or p_webhook_secret is null
    or extensions.digest(convert_to(v_expected_secret,'UTF8'),'sha256')<>extensions.digest(convert_to(p_webhook_secret,'UTF8'),'sha256') then
    raise exception 'authentication_failed' using errcode='28000';
  end if;
  v_user_id:=private.validate_paddle_catalog_event(p_provider_environment,p_event_type,p_checkout_reference,
    p_price_id,p_provider_subscription_id,p_provider_transaction_id);
  if v_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('ssz_entitlement:'||v_user_id::text,0));
    if p_provider_environment='sandbox' then
      select * into v_live_entitlement from public.entitlements where user_id=v_user_id and provider_environment='live' for update;
      v_preserve_live:=v_live_entitlement.user_id is not null;
    end if;
  end if;
  perform set_config('app.paddle_environment',p_provider_environment,true);
  select r.state,r.affected_user_id into v_state,v_user_id from public.process_paddle_event(
    p_event_id,p_event_type,p_occurred_at,p_payload_sha256,p_checkout_reference,p_price_id,
    p_provider_customer_id,p_provider_subscription_id,p_provider_transaction_id,p_subscription_status,
    p_trial_ends_at,p_current_period_end,p_cancel_at_period_end) r;
  if v_preserve_live then
    update public.entitlements set access_tier=v_live_entitlement.access_tier,source=v_live_entitlement.source,
      valid_from=v_live_entitlement.valid_from,valid_until=v_live_entitlement.valid_until,revoked_at=v_live_entitlement.revoked_at,
      ads_enabled=v_live_entitlement.ads_enabled,device_limit=v_live_entitlement.device_limit,household_slots=v_live_entitlement.household_slots,
      updated_at=v_live_entitlement.updated_at,provider_environment='live' where user_id=v_live_entitlement.user_id;
  end if;
  if not v_preserve_live and v_user_id is not null and v_state in ('processed','transaction_confirmed') then
    update public.entitlements set provider_environment=p_provider_environment
      where user_id=v_user_id and source in ('trial','subscription','lifetime_purchase');
  end if;
  return query select v_state,v_user_id;
end $$;
revoke all on function webhook_private.process_paddle_event_from_webhook(text,text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function webhook_private.process_paddle_event_from_webhook(text,text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean) to anon,service_role;

-- Legacy webhook entrypoints must not bypass the environment-aware guard.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private','webhook_private') and p.proname='process_paddle_event_from_webhook'
      and p.pronargs<>15
  loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); end loop;
end $$;


-- payment-adjustments.sql
-- Review artifact. Apply after catalog-and-checkout-guard.sql.
-- Records provider adjustments without making refunds or issuing any charge.

create table if not exists private.paddle_entitlement_sources(
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider_environment text not null check(provider_environment in ('sandbox','live')),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade
);
create table if not exists private.paddle_access_adjustments(
  provider_environment text not null check(provider_environment in ('sandbox','live')),
  adjustment_id text not null check(adjustment_id ~ '^adj_[a-z0-9]{26}$'),
  provider_transaction_id text not null check(provider_transaction_id ~ '^txn_[a-z0-9]{26}$'),
  provider_subscription_id text,
  action text not null,
  status text not null,
  adjustment_type text,
  occurred_at timestamptz not null,
  access_hold boolean not null default false,
  needs_review boolean not null default false,
  primary key(provider_environment,adjustment_id)
);
alter table private.paddle_entitlement_sources enable row level security;
alter table private.paddle_access_adjustments enable row level security;
revoke all on private.paddle_entitlement_sources,private.paddle_access_adjustments from public,anon,authenticated,service_role;
create index if not exists paddle_adjustment_transaction_idx on private.paddle_access_adjustments(provider_environment,provider_transaction_id);
-- Backfill only an unambiguous payment source. Never attach a manual grant.
insert into private.paddle_entitlement_sources(user_id,provider_environment,subscription_id)
select e.user_id,e.provider_environment,min(s.id::text)::uuid from public.entitlements e
join public.subscriptions s on s.user_id=e.user_id and s.provider_environment=e.provider_environment and s.provider='paddle'
where e.source in ('trial','subscription','lifetime_purchase') and e.provider_environment in ('live','sandbox')
group by e.user_id,e.provider_environment having count(*)=1
on conflict(user_id) do nothing;

create or replace function private.enforce_paddle_adjustment_hold(p_user_id uuid,p_provider_environment text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_blocked boolean:=false;
begin
  select exists(select 1 from private.paddle_entitlement_sources es
    join public.subscriptions s on s.id=es.subscription_id
    join private.paddle_access_adjustments a on a.provider_environment=es.provider_environment
      and (a.provider_transaction_id=s.provider_transaction_id
        or (s.provider_transaction_id is null and a.provider_subscription_id=s.provider_subscription_id))
    where es.user_id=p_user_id and es.provider_environment=p_provider_environment
      and a.access_hold
  ) into v_blocked;
  if v_blocked then
    update public.entitlements set revoked_at=coalesce(revoked_at,now()),updated_at=now()
    where user_id=p_user_id and provider_environment=p_provider_environment
      and source in ('trial','subscription','lifetime_purchase');
  end if;
  return v_blocked;
end $$;
revoke all on function private.enforce_paddle_adjustment_hold(uuid,text) from public,anon,authenticated,service_role;

create or replace function webhook_private.process_paddle_adjustment_from_webhook(
  p_provider_environment text,p_webhook_secret text,p_event_id text,p_event_type text,
  p_occurred_at timestamptz,p_payload_sha256 text,p_adjustment_id text,p_action text,p_status text,
  p_adjustment_type text,p_provider_transaction_id text,p_provider_subscription_id text
) returns table(state text,affected_user_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_expected_secret text; v_subscription public.subscriptions; v_previous private.paddle_access_adjustments; v_held boolean;
begin
  if p_provider_environment is null or p_provider_environment not in ('sandbox','live') then raise exception 'invalid_environment'; end if;
  select decrypted_secret into v_expected_secret from vault.decrypted_secrets
    where name='paddle_'||p_provider_environment||'_webhook_secret' limit 1;
  if v_expected_secret is null or p_webhook_secret is null
    or extensions.digest(convert_to(v_expected_secret,'UTF8'),'sha256')<>extensions.digest(convert_to(p_webhook_secret,'UTF8'),'sha256') then
    raise exception 'authentication_failed' using errcode='28000';
  end if;
  if p_event_type not in ('adjustment.created','adjustment.updated') or p_event_id !~ '^evt_[a-z0-9]{26}$'
    or p_adjustment_id !~ '^adj_[a-z0-9]{26}$' or p_provider_transaction_id !~ '^txn_[a-z0-9]{26}$'
    or p_payload_sha256 !~ '^[a-f0-9]{64}$' or p_occurred_at is null
    or p_action not in ('refund','chargeback','chargeback_warning','chargeback_reverse','chargeback_warning_reverse','credit','credit_reverse')
    or p_status not in ('pending_approval','approved','rejected','reversed')
    or (p_adjustment_type is not null and p_adjustment_type not in ('full','partial','tax')) then raise exception 'invalid_adjustment'; end if;
  perform set_config('app.paddle_environment',p_provider_environment,true);
  begin
    insert into public.payment_events(provider,provider_event_id,event_type,payload_sha256,status,occurred_at)
      values('paddle',p_event_id,p_event_type,p_payload_sha256,'received',p_occurred_at);
  exception when unique_violation then return query select 'duplicate'::text,null::uuid; return; end;
  perform pg_advisory_xact_lock(hashtextextended('ssz_adjustment:'||p_provider_environment||':'||p_adjustment_id,0));
  select * into v_previous from private.paddle_access_adjustments a
    where a.provider_environment=p_provider_environment and a.adjustment_id=p_adjustment_id;
  if v_previous.adjustment_id is not null and (p_occurred_at<v_previous.occurred_at
    or (p_occurred_at=v_previous.occurred_at and v_previous.status in ('approved','rejected','reversed') and p_status='pending_approval')) then
    update public.payment_events set status='ignored',processed_at=now() where provider='paddle' and provider_event_id=p_event_id;
    return query select 'stale'::text,null::uuid; return;
  end if;
  insert into private.paddle_access_adjustments(provider_environment,adjustment_id,provider_transaction_id,provider_subscription_id,action,status,adjustment_type,occurred_at,access_hold,needs_review)
    values(p_provider_environment,p_adjustment_id,p_provider_transaction_id,p_provider_subscription_id,p_action,p_status,p_adjustment_type,p_occurred_at,
      (p_status='approved' and (p_action='chargeback' or (p_action='refund' and p_adjustment_type='full')))
        or coalesce(v_previous.access_hold,false),
      p_action in ('chargeback','chargeback_warning','chargeback_reverse','chargeback_warning_reverse')
      or (p_action='refund' and p_status='approved') or p_status='reversed')
  on conflict(provider_environment,adjustment_id) do update set
    provider_transaction_id=excluded.provider_transaction_id,provider_subscription_id=excluded.provider_subscription_id,
    action=excluded.action,status=excluded.status,adjustment_type=excluded.adjustment_type,occurred_at=excluded.occurred_at,access_hold=excluded.access_hold,needs_review=excluded.needs_review;
  select * into v_subscription from public.subscriptions s where s.provider='paddle' and s.provider_environment=p_provider_environment
    and (s.provider_transaction_id=p_provider_transaction_id or s.provider_subscription_id=p_provider_subscription_id)
    order by (s.provider_transaction_id=p_provider_transaction_id) desc nulls last limit 1;
  if v_subscription.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('ssz_billing:'||v_subscription.user_id::text||':'||p_provider_environment,0));
    perform pg_advisory_xact_lock(hashtextextended('ssz_entitlement:'||v_subscription.user_id::text,0));
    v_held:=private.enforce_paddle_adjustment_hold(v_subscription.user_id,p_provider_environment);
  end if;
  update public.payment_events set status='processed',processed_at=now() where provider='paddle' and provider_event_id=p_event_id;
  return query select case when p_action like '%reverse%' or p_status='reversed' then 'review_required'
    when v_held then 'access_revoked' when v_subscription.id is null then 'awaiting_subscription' else 'recorded' end,v_subscription.user_id;
end $$;
create or replace function public.process_paddle_adjustment_from_webhook(
  p_provider_environment text,p_webhook_secret text,p_event_id text,p_event_type text,
  p_occurred_at timestamptz,p_payload_sha256 text,p_adjustment_id text,p_action text,p_status text,
  p_adjustment_type text,p_provider_transaction_id text,p_provider_subscription_id text
) returns table(state text,affected_user_id uuid)
language sql security invoker set search_path='' as $$
  select * from webhook_private.process_paddle_adjustment_from_webhook(p_provider_environment,p_webhook_secret,p_event_id,p_event_type,
    p_occurred_at,p_payload_sha256,p_adjustment_id,p_action,p_status,p_adjustment_type,p_provider_transaction_id,p_provider_subscription_id);
$$;
revoke all on function webhook_private.process_paddle_adjustment_from_webhook(text,text,text,text,timestamptz,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.process_paddle_adjustment_from_webhook(text,text,text,text,timestamptz,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function webhook_private.process_paddle_adjustment_from_webhook(text,text,text,text,timestamptz,text,text,text,text,text,text,text) to anon,service_role;
grant execute on function public.process_paddle_adjustment_from_webhook(text,text,text,text,timestamptz,text,text,text,text,text,text,text) to anon,service_role;

-- Add reconciliation inside the same signed payment transaction, after the
-- existing grant. A late subscription event cannot undo an approved refund.
do $$ declare v_definition text; v_anchor text; v_replacement text; begin
  select pg_get_functiondef('webhook_private.process_paddle_event_from_webhook(text,text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean)'::regprocedure)
    into v_definition;
  v_anchor:='  return query select v_state,v_user_id;';
  v_replacement:=$patch$
  if not v_preserve_live and v_user_id is not null and v_state in ('processed','transaction_confirmed') then
    insert into private.paddle_entitlement_sources(user_id,provider_environment,subscription_id)
      select v_user_id,p_provider_environment,s.id from public.subscriptions s
      where s.user_id=v_user_id and s.provider='paddle' and s.provider_environment=p_provider_environment
        and ((p_provider_subscription_id is not null and s.provider_subscription_id=p_provider_subscription_id)
          or (p_provider_transaction_id is not null and s.provider_transaction_id=p_provider_transaction_id))
      limit 1
      on conflict(user_id) do update set provider_environment=excluded.provider_environment,subscription_id=excluded.subscription_id;
    if private.enforce_paddle_adjustment_hold(v_user_id,p_provider_environment) then v_state:='access_revoked'; end if;
  end if;
  return query select v_state,v_user_id;
$patch$;
  if position('private.paddle_entitlement_sources' in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then raise exception 'unexpected_payment_wrapper_definition'; end if;
    execute replace(v_definition,v_anchor,v_replacement);
  end if;
end $$;


-- checkout-transactions.sql
-- Apply after catalog-and-checkout-guard.sql and payment-adjustments.sql.
-- One provider transaction per authenticated intention; uncertain outcomes
-- never trigger automatic creation of a second transaction.

create table if not exists private.paddle_checkout_preparations(
  intent_id uuid primary key references public.checkout_intents(id) on delete cascade,
  claim_id uuid not null default gen_random_uuid(),
  state text not null check(state in ('creating','ready','uncertain','canceled')),
  provider_transaction_id text check(provider_transaction_id ~ '^txn_[a-z0-9]{26}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_transaction_id)
);
alter table private.paddle_checkout_preparations enable row level security;
revoke all on private.paddle_checkout_preparations from public,anon,authenticated,service_role;

create or replace function private.claim_paddle_checkout_transaction(p_user_id uuid,p_intent_id uuid)
returns table(state text,claim_id uuid,transaction_id text)
language plpgsql security definer set search_path='' as $$
declare i public.checkout_intents; p private.paddle_checkout_preparations;
begin
  select * into i from public.checkout_intents where id=p_intent_id and user_id=p_user_id;
  if i.id is null or i.status<>'pending' then raise exception 'invalid_checkout_reference'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ssz_billing:'||p_user_id::text||':'||i.provider_environment,0));
  select * into i from public.checkout_intents where id=p_intent_id and user_id=p_user_id for update;
  if i.id is null or i.status<>'pending' then raise exception 'invalid_checkout_reference'; end if;
  if exists(select 1 from public.account_deletion_requests d where d.user_id=p_user_id and d.status in ('pending','ready')) then raise exception 'account_deletion_pending'; end if;
  select * into p from private.paddle_checkout_preparations where intent_id=i.id;
  if p.intent_id is not null then
    return query select p.state,null::uuid,p.provider_transaction_id; return;
  end if;
  if i.expires_at<=now() then raise exception 'checkout_expired'; end if;
  if not exists(select 1 from private.paddle_price_catalog c where c.provider_environment=i.provider_environment and c.price_id=i.price_id and c.plan_code=i.plan_code and c.active) then raise exception 'invalid_catalog_price'; end if;
  insert into private.paddle_checkout_preparations(intent_id,state) values(i.id,'creating') returning * into p;
  return query select 'claimed'::text,p.claim_id,null::text;
end $$;
create or replace function private.finish_paddle_checkout_transaction(p_user_id uuid,p_intent_id uuid,p_claim_id uuid,p_transaction_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare i public.checkout_intents; p private.paddle_checkout_preparations;
begin
  select * into i from public.checkout_intents where id=p_intent_id and user_id=p_user_id for update;
  if i.id is null or i.status<>'pending' or p_transaction_id is null or p_transaction_id !~ '^txn_[a-z0-9]{26}$' then raise exception 'invalid_checkout_reference'; end if;
  select * into p from private.paddle_checkout_preparations where intent_id=i.id for update;
  if p.intent_id is null or p.claim_id is distinct from p_claim_id or p.state not in ('creating','ready') then raise exception 'invalid_checkout_claim'; end if;
  if p.state='ready' then
    if p.provider_transaction_id<>p_transaction_id then raise exception 'checkout_transaction_mismatch'; end if;
    return true;
  end if;
  update private.paddle_checkout_preparations set state='ready',provider_transaction_id=p_transaction_id,updated_at=now() where intent_id=i.id;
  update public.checkout_intents set provider_transaction_id=p_transaction_id,updated_at=now() where id=i.id;
  return true;
end $$;
create or replace function private.mark_paddle_checkout_uncertain(p_user_id uuid,p_intent_id uuid,p_claim_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update private.paddle_checkout_preparations p set state='uncertain',updated_at=now()
  from public.checkout_intents i where i.id=p.intent_id and i.id=p_intent_id and i.user_id=p_user_id
    and p.claim_id=p_claim_id and p.state='creating';
  return found;
end $$;
create or replace function private.list_pending_paddle_checkouts(p_user_id uuid,p_provider_environment text)
returns table(intent_id uuid,state text,transaction_id text)
language sql security definer set search_path='' as $$
  select i.id,coalesce(p.state,'unprepared'),p.provider_transaction_id from public.checkout_intents i
  left join private.paddle_checkout_preparations p on p.intent_id=i.id
  where i.user_id=p_user_id and i.provider_environment=p_provider_environment and i.status<>'completed'
    and (p.state in ('creating','ready','uncertain') or (p.intent_id is null and i.status='pending' and i.expires_at>now()));
$$;
create or replace function private.close_paddle_checkout_transaction(p_user_id uuid,p_intent_id uuid,p_transaction_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare i public.checkout_intents;
begin
  select * into i from public.checkout_intents where id=p_intent_id and user_id=p_user_id for update;
  if i.id is null or i.status='completed' then raise exception 'invalid_checkout_reference'; end if;
  update private.paddle_checkout_preparations set state='canceled',updated_at=now()
    where intent_id=i.id and provider_transaction_id=p_transaction_id and state in ('ready','canceled');
  if not found then raise exception 'checkout_transaction_mismatch'; end if;
  update public.checkout_intents set status='expired',updated_at=now() where id=i.id;
  return true;
end $$;
create or replace function private.begin_billing_safe_account_deletion(p_user_id uuid,p_provider_environment text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request_id uuid;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'authentication_required'; end if;
  if p_provider_environment not in ('sandbox','live') then raise exception 'invalid_environment'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ssz_billing:'||p_user_id::text||':'||p_provider_environment,0));
  if exists(select 1 from private.list_pending_paddle_checkouts(p_user_id,p_provider_environment)) then raise exception 'checkout_reconciliation_required'; end if;
  select id into v_request_id from public.account_deletion_requests where user_id=p_user_id and status in ('pending','ready') limit 1;
  if v_request_id is null then
    insert into public.account_deletion_requests(user_id,status) values(p_user_id,'pending') returning id into v_request_id;
  end if;
  return v_request_id;
end $$;

-- Thin exposed wrappers retain service_role-only privileges.
create or replace function public.claim_paddle_checkout_transaction(p_user_id uuid,p_intent_id uuid)
returns table(state text,claim_id uuid,transaction_id text) language sql security invoker set search_path='' as $$select * from private.claim_paddle_checkout_transaction(p_user_id,p_intent_id)$$;
create or replace function public.finish_paddle_checkout_transaction(p_user_id uuid,p_intent_id uuid,p_claim_id uuid,p_transaction_id text)
returns boolean language sql security invoker set search_path='' as $$select private.finish_paddle_checkout_transaction(p_user_id,p_intent_id,p_claim_id,p_transaction_id)$$;
create or replace function public.mark_paddle_checkout_uncertain(p_user_id uuid,p_intent_id uuid,p_claim_id uuid)
returns boolean language sql security invoker set search_path='' as $$select private.mark_paddle_checkout_uncertain(p_user_id,p_intent_id,p_claim_id)$$;
create or replace function public.list_pending_paddle_checkouts(p_user_id uuid,p_provider_environment text)
returns table(intent_id uuid,state text,transaction_id text) language sql security invoker set search_path='' as $$select * from private.list_pending_paddle_checkouts(p_user_id,p_provider_environment)$$;
create or replace function public.close_paddle_checkout_transaction(p_user_id uuid,p_intent_id uuid,p_transaction_id text)
returns boolean language sql security invoker set search_path='' as $$select private.close_paddle_checkout_transaction(p_user_id,p_intent_id,p_transaction_id)$$;
create or replace function public.begin_billing_safe_account_deletion(p_user_id uuid,p_provider_environment text)
returns uuid language sql security invoker set search_path='' as $$select private.begin_billing_safe_account_deletion(p_user_id,p_provider_environment)$$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in ('claim_paddle_checkout_transaction','finish_paddle_checkout_transaction',
      'mark_paddle_checkout_uncertain','list_pending_paddle_checkouts','close_paddle_checkout_transaction','begin_billing_safe_account_deletion')
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

-- An already-created provider checkout cannot expire only in our local database:
-- the buyer could still complete the same Paddle transaction. Preserve it until
-- paid or explicitly canceled at Paddle; never silently issue another transaction.
do $$ declare d text; begin
  select pg_get_functiondef('private.create_checkout_intent_for_user(uuid,text,text,text)'::regprocedure) into d;
  if position('private.paddle_checkout_preparations' in d)=0 then
    d:=replace(d,'and c.status=''pending'' and c.expires_at<=now();',
      'and c.status=''pending'' and c.expires_at<=now() and not exists(select 1 from private.paddle_checkout_preparations p where p.intent_id=c.id and p.state in (''creating'',''ready'',''uncertain''));');
    d:=replace(d,'and c.status=''pending'' and c.expires_at>now()',
      'and c.status=''pending'' and (c.expires_at>now() or exists(select 1 from private.paddle_checkout_preparations p where p.intent_id=c.id and p.state in (''creating'',''ready'',''uncertain'')))');
    if position('private.paddle_checkout_preparations' in d)=0 then raise exception 'unexpected_checkout_definition'; end if;
    execute d;
  end if;
end $$;
-- Match the initial grant to the exact server-created transaction. Lifecycle
-- notifications arriving before subscription.created may retry until the initial
-- transaction/subscription binding exists, instead of trusting only custom data.
do $$ declare d text; anchor text; replacement text; begin
  select pg_get_functiondef('private.validate_paddle_catalog_event(text,text,uuid,text,text,text)'::regprocedure) into d;
  if position('private.paddle_checkout_preparations' in d)=0 then
    d:=replace(d,'or (i.status=''pending'' and i.expires_at<=now())',
      'or (i.status=''pending'' and i.expires_at<=now() and not exists(select 1 from private.paddle_checkout_preparations p where p.intent_id=i.id and p.state=''ready''))');
    anchor:='  return v_user_id;';
    replacement:=$patch$
  if s.id is null then
    if not exists(select 1 from private.paddle_checkout_preparations p where p.intent_id=i.id and p.state='ready'
      and p.provider_transaction_id=p_provider_transaction_id) then raise exception 'checkout_transaction_mismatch'; end if;
    update public.checkout_intents set expires_at=greatest(expires_at,now()+interval '5 minutes') where id=i.id and status='pending';
  end if;
  return v_user_id;
$patch$;
    if position(anchor in d)=0 then raise exception 'unexpected_catalog_guard_definition'; end if;
    execute replace(d,anchor,replacement);
  end if;
end $$;


-- event-order-guard.sql
-- Review artifact. Apply after catalog, adjustments and checkout transaction guards.
-- No charges, refunds, membership cutover or administrative access changes.

create table if not exists private.paddle_transaction_watermarks (
  provider_environment text not null check (provider_environment in ('sandbox','live')),
  provider_subscription_id text not null check (provider_subscription_id ~ '^sub_[a-z0-9]{26}$'),
  provider_transaction_id text not null check (provider_transaction_id ~ '^txn_[a-z0-9]{26}$'),
  occurred_at timestamptz,
  primary key (provider_environment,provider_subscription_id)
);
alter table private.paddle_transaction_watermarks enable row level security;
revoke all on private.paddle_transaction_watermarks from public,anon,authenticated,service_role;

create table if not exists private.paddle_event_order_reviews (
  provider_environment text not null check (provider_environment in ('sandbox','live')),
  provider_event_id text not null,
  provider_subscription_id text not null,
  provider_transaction_id text not null,
  occurred_at timestamptz not null,
  payload_sha256 text not null,
  reason text not null,
  resolved_at timestamptz,
  primary key(provider_environment,provider_event_id)
);
alter table private.paddle_event_order_reviews enable row level security;
revoke all on private.paddle_event_order_reviews from public,anon,authenticated,service_role;

-- Existing rows do not contain a trustworthy transaction timestamp. Preserve
-- their binding; never invent a timestamp from a subscription lifecycle event.
-- A replay of that transaction.completed event initializes the exact timestamp.
insert into private.paddle_transaction_watermarks(provider_environment,provider_subscription_id,provider_transaction_id)
select provider_environment,provider_subscription_id,provider_transaction_id
from public.subscriptions where provider='paddle'
  and provider_subscription_id is not null and provider_transaction_id is not null
on conflict(provider_environment,provider_subscription_id) do nothing;

-- Lifecycle ordering must not discard a valid payment merely because the
-- lifecycle event arrived first. The ordered dispatcher checks its own clock.
do $$ declare definition text; anchor text; replacement text; begin
  select pg_get_functiondef('private.process_paddle_event(text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean)'::regprocedure)
    into definition;
  anchor:='if v_subscription.provider_updated_at is not null and p_occurred_at < v_subscription.provider_updated_at then';
  replacement:='if p_event_type <> ''transaction.completed'' and v_subscription.provider_updated_at is not null and p_occurred_at < v_subscription.provider_updated_at then';
  if position(replacement in definition)=0 then
    if position(anchor in definition)=0 then raise exception 'unexpected_payment_processor_definition'; end if;
    execute replace(definition,anchor,replacement);
  end if;
end $$;

create or replace function private.process_paddle_event_ordered(
  p_event_id text,p_event_type text,p_occurred_at timestamptz,p_payload_sha256 text,
  p_checkout_reference uuid,p_price_id text,p_provider_customer_id text,
  p_provider_subscription_id text,p_provider_transaction_id text,p_subscription_status text,
  p_trial_ends_at timestamptz,p_current_period_end timestamptz,p_cancel_at_period_end boolean
) returns table(state text,affected_user_id uuid)
language plpgsql security definer set search_path='' as $$
declare
  environment text:=current_setting('app.paddle_environment',true);
  target_subscription public.subscriptions;
  prior_entitlement public.entitlements;
  prior_source private.paddle_entitlement_sources;
  watermark private.paddle_transaction_watermarks;
  actor uuid; plan text; outcome text; reason text;
  preserve_source boolean:=false;
begin
  if environment is null or environment not in ('live','sandbox') then raise exception 'invalid_environment'; end if;
  if p_event_id is null or p_event_id !~ '^evt_[a-z0-9]{26}$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[a-f0-9]{64}$'
    or p_occurred_at is null then raise exception 'invalid_event'; end if;

  if p_provider_subscription_id is not null then
    select * into target_subscription from public.subscriptions
    where provider='paddle' and provider_environment=environment
      and provider_subscription_id=p_provider_subscription_id limit 1;
  elsif p_provider_transaction_id is not null then
    select * into target_subscription from public.subscriptions
    where provider='paddle' and provider_environment=environment
      and provider_transaction_id=p_provider_transaction_id limit 1;
  end if;
  actor:=target_subscription.user_id;
  if p_checkout_reference is not null then
    select ci.plan_code,coalesce(actor,ci.user_id) into plan,actor
    from public.checkout_intents ci where ci.id=p_checkout_reference and ci.provider_environment=environment;
  end if;
  if actor is not null then
    -- Same order as the signed wrapper and adjustment processor.
    perform pg_advisory_xact_lock(hashtextextended('ssz_billing:'||actor::text||':'||environment,0));
    perform pg_advisory_xact_lock(hashtextextended('ssz_entitlement:'||actor::text,0));
    select * into prior_entitlement from public.entitlements where user_id=actor for update;
    select * into prior_source from private.paddle_entitlement_sources where user_id=actor;
    -- A known former subscription may update its own historical row, but must
    -- not regain ownership of a later purchase or revoke that purchase's access.
    preserve_source:=prior_entitlement.user_id is not null and (
      prior_entitlement.source not in ('trial','subscription','lifetime_purchase','signup')
      or (prior_entitlement.source in ('trial','subscription','lifetime_purchase')
        and target_subscription.id is not null and prior_source.subscription_id is null)
      or (target_subscription.id is not null and prior_source.subscription_id is not null
        and prior_source.subscription_id<>target_subscription.id)
    );
  end if;

  if p_provider_subscription_id is not null then
    select * into watermark from private.paddle_transaction_watermarks
    where provider_environment=environment and provider_subscription_id=p_provider_subscription_id for update;
    if watermark.provider_subscription_id is null and target_subscription.provider_transaction_id is not null then
      insert into private.paddle_transaction_watermarks(provider_environment,provider_subscription_id,provider_transaction_id)
      values(environment,p_provider_subscription_id,target_subscription.provider_transaction_id)
      on conflict(provider_environment,provider_subscription_id) do nothing;
      select * into watermark from private.paddle_transaction_watermarks
      where provider_environment=environment and provider_subscription_id=p_provider_subscription_id for update;
    end if;
  end if;

  if p_event_type='transaction.completed' and p_provider_subscription_id is not null then
    if p_provider_transaction_id is null or p_provider_transaction_id !~ '^txn_[a-z0-9]{26}$' then raise exception 'invalid_transaction'; end if;
    if watermark.provider_transaction_id is not null and watermark.provider_transaction_id<>p_provider_transaction_id then
      if watermark.occurred_at is null then reason:='transaction_order_review';
      elsif p_occurred_at<watermark.occurred_at then reason:='stale_transaction';
      elsif p_occurred_at=watermark.occurred_at then reason:='transaction_order_review'; end if;
    end if;
    if reason is not null then
      if reason='transaction_order_review' then
        if exists(select 1 from private.paddle_event_order_reviews r
          where r.provider_environment=environment and r.provider_event_id=p_event_id
            and r.payload_sha256<>p_payload_sha256) then raise exception 'event_payload_mismatch'; end if;
        -- Do not consume the payment event. After the clock is reconciled, the
        -- authentic original event can be replayed once using the same event ID.
        insert into private.paddle_event_order_reviews(provider_environment,provider_event_id,
          provider_subscription_id,provider_transaction_id,occurred_at,payload_sha256,reason)
        values(environment,p_event_id,p_provider_subscription_id,p_provider_transaction_id,p_occurred_at,p_payload_sha256,reason)
        on conflict(provider_environment,provider_event_id) do nothing;
        return query select reason,actor; return;
      end if;
      begin
        insert into public.payment_events(provider,provider_event_id,event_type,payload_sha256,status,occurred_at,provider_environment,processed_at)
        values('paddle',p_event_id,p_event_type,p_payload_sha256,
          case when reason='transaction_order_review' then 'failed' else 'ignored' end,
          p_occurred_at,environment,now());
      exception when unique_violation then return query select 'duplicate'::text,null::uuid; return; end;
      return query select reason,actor; return;
    end if;
  end if;

  if p_event_type='transaction.completed' and p_provider_subscription_id is null and plan='founder_annual' then
    select r.state,r.affected_user_id into outcome,actor from private.process_paddle_annual_pix_event(
      p_event_id,p_event_type,p_occurred_at,p_payload_sha256,p_checkout_reference,p_price_id,
      p_provider_customer_id,p_provider_transaction_id) r;
  else
    select r.state,r.affected_user_id into outcome,actor from private.process_paddle_event(
      p_event_id,p_event_type,p_occurred_at,p_payload_sha256,p_checkout_reference,p_price_id,
      p_provider_customer_id,p_provider_subscription_id,p_provider_transaction_id,p_subscription_status,
      p_trial_ends_at,p_current_period_end,p_cancel_at_period_end) r;
  end if;

  -- An authentic duplicate may safely initialize a missing legacy clock from
  -- its matching immutable processed event, without granting access again.
  if outcome='duplicate' and p_event_type='transaction.completed'
    and watermark.provider_transaction_id=p_provider_transaction_id and watermark.occurred_at is null
    and exists(select 1 from public.payment_events e where e.provider='paddle'
      and e.provider_environment=environment and e.provider_event_id=p_event_id
      and e.event_type=p_event_type and e.status='processed'
      and e.payload_sha256=p_payload_sha256 and e.occurred_at=p_occurred_at) then
    update private.paddle_transaction_watermarks set occurred_at=p_occurred_at
    where provider_environment=environment and provider_subscription_id=p_provider_subscription_id and occurred_at is null;
  end if;

  if outcome in ('processed','transaction_confirmed') and p_provider_subscription_id is not null then
    if p_event_type='transaction.completed' then
      insert into private.paddle_transaction_watermarks(provider_environment,provider_subscription_id,provider_transaction_id,occurred_at)
      values(environment,p_provider_subscription_id,p_provider_transaction_id,p_occurred_at)
      on conflict(provider_environment,provider_subscription_id) do update set
        provider_transaction_id=excluded.provider_transaction_id,
        occurred_at=case when private.paddle_transaction_watermarks.provider_transaction_id=excluded.provider_transaction_id
          then coalesce(private.paddle_transaction_watermarks.occurred_at,excluded.occurred_at) else excluded.occurred_at end;
    end if;
    -- Lifecycle payloads do not replace the last completed-payment binding.
    update public.subscriptions s set provider_transaction_id=w.provider_transaction_id
    from private.paddle_transaction_watermarks w
    where s.provider='paddle' and s.provider_environment=environment and s.provider_subscription_id=p_provider_subscription_id
      and w.provider_environment=environment and w.provider_subscription_id=p_provider_subscription_id
      and s.provider_transaction_id is distinct from w.provider_transaction_id;
    update private.paddle_event_order_reviews set resolved_at=now()
    where provider_environment=environment and provider_event_id=p_event_id and resolved_at is null;
  end if;

  if preserve_source and outcome in ('processed','transaction_confirmed') then
    update public.entitlements set access_tier=prior_entitlement.access_tier,source=prior_entitlement.source,
      valid_from=prior_entitlement.valid_from,valid_until=prior_entitlement.valid_until,revoked_at=prior_entitlement.revoked_at,
      ads_enabled=prior_entitlement.ads_enabled,device_limit=prior_entitlement.device_limit,household_slots=prior_entitlement.household_slots,
      updated_at=prior_entitlement.updated_at,provider_environment=prior_entitlement.provider_environment
    where user_id=prior_entitlement.user_id;
    -- The outer signed wrapper must not reassign the entitlement source.
    outcome:='historical_processed';
  end if;
  return query select outcome,actor;
end $$;
revoke all on function private.process_paddle_event_ordered(text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean) from public,anon,authenticated,service_role;

create or replace function public.process_paddle_event(
  p_event_id text,p_event_type text,p_occurred_at timestamptz,p_payload_sha256 text,
  p_checkout_reference uuid,p_price_id text,p_provider_customer_id text,
  p_provider_subscription_id text,p_provider_transaction_id text,p_subscription_status text,
  p_trial_ends_at timestamptz,p_current_period_end timestamptz,p_cancel_at_period_end boolean
) returns table(state text,affected_user_id uuid)
language sql security invoker set search_path='' as $$
  select * from private.process_paddle_event_ordered(
    p_event_id,p_event_type,p_occurred_at,p_payload_sha256,p_checkout_reference,p_price_id,
    p_provider_customer_id,p_provider_subscription_id,p_provider_transaction_id,p_subscription_status,
    p_trial_ends_at,p_current_period_end,p_cancel_at_period_end);
$$;
-- Only the authenticated, catalog-validating SECURITY DEFINER webhook wrapper
-- invokes these processors as their owner. No raw RPC bypass remains granted.
revoke all on function public.process_paddle_event(text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean) from public,anon,authenticated,service_role;
revoke all on function private.process_paddle_event(text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean) from public,anon,authenticated,service_role;
revoke all on function private.process_paddle_annual_pix_event(text,text,timestamptz,text,uuid,text,text,text) from public,anon,authenticated,service_role;

commit;
