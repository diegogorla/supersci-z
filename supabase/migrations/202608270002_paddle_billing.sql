-- SUPER SCI-Z: checkout intents and atomic Paddle event processing.
-- Browser input never decides which user or entitlement receives a payment.

alter table public.subscriptions
  add column if not exists provider_transaction_id text,
  add column if not exists provider_updated_at timestamptz;

create unique index if not exists subscriptions_provider_transaction_unique
  on public.subscriptions(provider, provider_transaction_id)
  where provider_transaction_id is not null;

alter table public.payment_events
  add column if not exists occurred_at timestamptz;

create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('founder_monthly', 'founder_annual', 'cosmos_monthly', 'cosmos_annual', 'lifetime')),
  price_id text not null check (price_id ~ '^pri_[a-z0-9]{26}$'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired')),
  provider_transaction_id text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checkout_intents_user_status_idx
  on public.checkout_intents(user_id, status, expires_at desc);
create unique index if not exists checkout_intents_provider_transaction_unique
  on public.checkout_intents(provider_transaction_id)
  where provider_transaction_id is not null;

alter table public.checkout_intents enable row level security;
revoke all on public.checkout_intents from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.checkout_intents to service_role;
grant select on public.checkout_intents to authenticated;

create policy checkout_intent_select on public.checkout_intents
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function private.create_checkout_intent(p_plan_code text, p_price_id text)
returns table(intent_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_plan_code not in ('founder_monthly', 'founder_annual', 'cosmos_monthly', 'cosmos_annual', 'lifetime') then
    raise exception 'invalid_plan';
  end if;
  if p_price_id !~ '^pri_[a-z0-9]{26}$' then raise exception 'invalid_price'; end if;

  update public.checkout_intents
    set status = 'expired', updated_at = now()
    where user_id = v_user_id and status = 'pending' and expires_at <= now();

  return query
    insert into public.checkout_intents(user_id, plan_code, price_id)
    values (v_user_id, p_plan_code, p_price_id)
    returning public.checkout_intents.id, public.checkout_intents.expires_at;
end;
$$;

create or replace function private.process_paddle_event(
  p_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payload_sha256 text,
  p_checkout_reference uuid,
  p_price_id text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_transaction_id text,
  p_subscription_status text,
  p_trial_ends_at timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns table(state text, affected_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.checkout_intents;
  v_subscription public.subscriptions;
  v_user_id uuid;
  v_plan_code text;
  v_tier text;
  v_status text;
  v_subscription_id uuid;
begin
  if p_event_id !~ '^evt_[a-z0-9]{26}$' or p_payload_sha256 !~ '^[a-f0-9]{64}$' then
    return query select 'invalid_event', null::uuid;
    return;
  end if;

  begin
    insert into public.payment_events(provider, provider_event_id, event_type, payload_sha256, status, occurred_at)
    values ('paddle', p_event_id, p_event_type, p_payload_sha256, 'received', p_occurred_at);
  exception when unique_violation then
    return query select 'duplicate', null::uuid;
    return;
  end;

  if p_event_type not in (
    'transaction.completed', 'subscription.created', 'subscription.trialing',
    'subscription.activated', 'subscription.updated', 'subscription.past_due',
    'subscription.paused', 'subscription.resumed', 'subscription.canceled'
  ) then
    update public.payment_events set status = 'ignored', processed_at = now()
      where provider = 'paddle' and provider_event_id = p_event_id;
    return query select 'ignored', null::uuid;
    return;
  end if;

  if p_provider_subscription_id is not null then
    select * into v_subscription from public.subscriptions
      where provider = 'paddle' and provider_subscription_id = p_provider_subscription_id
      limit 1 for update;
  end if;
  if v_subscription.id is null and p_provider_transaction_id is not null then
    select * into v_subscription from public.subscriptions
      where provider = 'paddle' and provider_transaction_id = p_provider_transaction_id
      limit 1 for update;
  end if;

  if v_subscription.id is not null then
    if v_subscription.provider_updated_at is not null and p_occurred_at < v_subscription.provider_updated_at then
      update public.payment_events set status = 'ignored', processed_at = now()
        where provider = 'paddle' and provider_event_id = p_event_id;
      return query select 'stale', v_subscription.user_id;
      return;
    end if;
    v_user_id := v_subscription.user_id;
    v_plan_code := v_subscription.plan_code;
  else
    if p_checkout_reference is null then
      update public.payment_events set status = 'failed', processed_at = now()
        where provider = 'paddle' and provider_event_id = p_event_id;
      return query select 'missing_checkout_reference', null::uuid;
      return;
    end if;

    select * into v_intent from public.checkout_intents
      where id = p_checkout_reference limit 1 for update;
    if v_intent.id is null or (v_intent.status = 'pending' and v_intent.expires_at <= now()) then
      update public.checkout_intents set status = 'expired', updated_at = now()
        where id = p_checkout_reference and status = 'pending';
      update public.payment_events set status = 'failed', processed_at = now()
        where provider = 'paddle' and provider_event_id = p_event_id;
      return query select 'invalid_checkout_reference', null::uuid;
      return;
    end if;
    if p_price_id is null or p_price_id <> v_intent.price_id then
      update public.payment_events set status = 'failed', processed_at = now()
        where provider = 'paddle' and provider_event_id = p_event_id;
      return query select 'price_mismatch', null::uuid;
      return;
    end if;
    v_user_id := v_intent.user_id;
    v_plan_code := v_intent.plan_code;
  end if;

  if v_plan_code = 'lifetime' then
    if p_event_type <> 'transaction.completed' or p_provider_transaction_id is null then
      update public.payment_events set status = 'ignored', processed_at = now()
        where provider = 'paddle' and provider_event_id = p_event_id;
      return query select 'ignored', v_user_id;
      return;
    end if;
    v_status := 'active';
  else
    if p_provider_subscription_id is null or p_subscription_status not in ('trialing', 'active', 'past_due', 'paused', 'canceled') then
      update public.payment_events set status = 'failed', processed_at = now()
        where provider = 'paddle' and provider_event_id = p_event_id;
      return query select 'invalid_subscription', v_user_id;
      return;
    end if;
    v_status := p_subscription_status;
  end if;

  if v_plan_code = 'lifetime' then
    insert into public.subscriptions(
      user_id, plan_code, provider, provider_customer_id, provider_transaction_id,
      status, provider_updated_at
    ) values (
      v_user_id, v_plan_code, 'paddle', p_provider_customer_id, p_provider_transaction_id,
      'active', p_occurred_at
    )
    on conflict (provider, provider_transaction_id) where provider_transaction_id is not null
    do update set
      provider_customer_id = excluded.provider_customer_id,
      status = 'active', provider_updated_at = excluded.provider_updated_at, updated_at = now()
    returning id into v_subscription_id;
  else
    insert into public.subscriptions(
      user_id, plan_code, provider, provider_customer_id, provider_subscription_id,
      provider_transaction_id, status, trial_ends_at, current_period_end,
      cancel_at_period_end, canceled_at, provider_updated_at
    ) values (
      v_user_id, v_plan_code, 'paddle', p_provider_customer_id, p_provider_subscription_id,
      p_provider_transaction_id, v_status, p_trial_ends_at, p_current_period_end,
      coalesce(p_cancel_at_period_end, false), case when v_status = 'canceled' then p_occurred_at else null end,
      p_occurred_at
    )
    on conflict (provider, provider_subscription_id)
    do update set
      provider_customer_id = excluded.provider_customer_id,
      provider_transaction_id = coalesce(excluded.provider_transaction_id, public.subscriptions.provider_transaction_id),
      status = excluded.status,
      trial_ends_at = coalesce(excluded.trial_ends_at, public.subscriptions.trial_ends_at),
      current_period_end = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
      cancel_at_period_end = excluded.cancel_at_period_end,
      canceled_at = excluded.canceled_at,
      provider_updated_at = excluded.provider_updated_at,
      updated_at = now()
    where public.subscriptions.provider_updated_at is null
       or excluded.provider_updated_at >= public.subscriptions.provider_updated_at
    returning id into v_subscription_id;
  end if;

  v_tier := case
    when v_plan_code like 'founder_%' then 'founder'
    when v_plan_code like 'cosmos_%' then 'cosmos'
    else 'lifetime'
  end;

  if v_status in ('trialing', 'active') then
    insert into public.entitlements(
      user_id, access_tier, source, valid_from, valid_until, revoked_at,
      ads_enabled, device_limit, household_slots, updated_at
    ) values (
      v_user_id, v_tier,
      case when v_status = 'trialing' then 'trial' when v_plan_code = 'lifetime' then 'lifetime_purchase' else 'subscription' end,
      now(), case when v_plan_code = 'lifetime' then null else coalesce(p_current_period_end, p_trial_ends_at) end,
      null, v_tier <> 'cosmos', case when v_tier = 'cosmos' then 3 else 1 end,
      case when v_tier = 'cosmos' then 2 else 0 end, now()
    )
    on conflict (user_id) do update set
      access_tier = excluded.access_tier, source = excluded.source,
      valid_from = excluded.valid_from, valid_until = excluded.valid_until,
      revoked_at = null, ads_enabled = excluded.ads_enabled,
      device_limit = excluded.device_limit, household_slots = excluded.household_slots,
      updated_at = now();
  else
    update public.entitlements set revoked_at = now(), updated_at = now()
      where user_id = v_user_id and source in ('trial', 'subscription');
  end if;

  if p_checkout_reference is not null then
    update public.checkout_intents set
      status = 'completed', provider_transaction_id = p_provider_transaction_id, updated_at = now()
      where id = p_checkout_reference;
  end if;
  update public.payment_events set status = 'processed', processed_at = now()
    where provider = 'paddle' and provider_event_id = p_event_id;
  return query select 'processed', v_user_id;
end;
$$;

create or replace function public.create_checkout_intent(p_plan_code text, p_price_id text)
returns table(intent_id uuid, expires_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.create_checkout_intent(p_plan_code, p_price_id);
$$;

create or replace function public.process_paddle_event(
  p_event_id text, p_event_type text, p_occurred_at timestamptz,
  p_payload_sha256 text, p_checkout_reference uuid, p_price_id text,
  p_provider_customer_id text, p_provider_subscription_id text,
  p_provider_transaction_id text, p_subscription_status text,
  p_trial_ends_at timestamptz, p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns table(state text, affected_user_id uuid)
language sql security invoker set search_path = '' as $$
  select * from private.process_paddle_event(
    p_event_id, p_event_type, p_occurred_at, p_payload_sha256,
    p_checkout_reference, p_price_id, p_provider_customer_id,
    p_provider_subscription_id, p_provider_transaction_id,
    p_subscription_status, p_trial_ends_at, p_current_period_end,
    p_cancel_at_period_end
  );
$$;

revoke all on function private.create_checkout_intent(text, text) from public, anon, authenticated, service_role;
revoke all on function private.process_paddle_event(text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) from public, anon, authenticated, service_role;
revoke all on function public.create_checkout_intent(text, text) from public, anon, authenticated, service_role;
revoke all on function public.process_paddle_event(text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) from public, anon, authenticated, service_role;

grant execute on function private.create_checkout_intent(text, text) to authenticated;
grant execute on function public.create_checkout_intent(text, text) to authenticated;
grant execute on function private.process_paddle_event(text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.process_paddle_event(text, text, timestamptz, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) to service_role;

-- A lifetime purchase has no future renewal to cancel. Account deletion only
-- waits for subscriptions that have an external recurring subscription ID.
create or replace function private.request_account_deletion()
returns table(state text,request_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_subscription public.subscriptions; v_request_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select id into v_request_id from public.account_deletion_requests where user_id=v_user_id and status in('pending','ready') limit 1;
  if v_request_id is null then insert into public.account_deletion_requests(user_id) values(v_user_id) returning id into v_request_id; end if;
  update public.communication_preferences set email_opt_in=false,whatsapp_opt_in=false,telegram_opt_in=false,sms_opt_in=false,updated_at=now() where user_id=v_user_id;
  select * into v_subscription from public.subscriptions
    where user_id=v_user_id and provider_subscription_id is not null
      and status in('trialing','active','past_due','paused')
    order by created_at desc limit 1;
  if v_subscription.id is not null then
    if not exists(select 1 from public.cancellation_requests where subscription_id=v_subscription.id and status in('pending','processing')) then
      insert into public.cancellation_requests(user_id,subscription_id) values(v_user_id,v_subscription.id);
    end if;
    return query select 'pending_cancellation',v_request_id; return;
  end if;
  update public.account_deletion_requests set status='ready' where id=v_request_id;
  return query select 'ready',v_request_id;
end; $$;
