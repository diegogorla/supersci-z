-- A recurring transaction.completed event reports the transaction status
-- ("completed"), not a subscription lifecycle status. Record it without
-- overwriting the subscription state established by subscription.* events.

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

  if p_event_type = 'transaction.completed' and v_plan_code <> 'lifetime' then
    if p_provider_transaction_id is null or p_provider_subscription_id is null then
      update public.payment_events set status = 'failed', processed_at = now()
        where provider = 'paddle' and provider_event_id = p_event_id;
      return query select 'invalid_transaction', v_user_id;
      return;
    end if;

    if v_subscription.id is not null then
      update public.subscriptions set
        provider_customer_id = coalesce(p_provider_customer_id, provider_customer_id),
        provider_transaction_id = p_provider_transaction_id,
        updated_at = now()
      where id = v_subscription.id;
    end if;

    if p_checkout_reference is not null then
      update public.checkout_intents set
        status = 'completed', provider_transaction_id = p_provider_transaction_id, updated_at = now()
        where id = p_checkout_reference;
    end if;
    update public.payment_events set status = 'processed', processed_at = now()
      where provider = 'paddle' and provider_event_id = p_event_id;
    return query select 'transaction_confirmed', v_user_id;
    return;
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
    if p_provider_subscription_id is null
       or p_subscription_status is null
       or p_subscription_status not in ('trialing', 'active', 'past_due', 'paused', 'canceled') then
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

-- Route through the public dispatcher so one-time annual Pix transactions keep
-- using their dedicated processor while the secret stays inside this function.
create or replace function webhook_private.process_paddle_event_from_webhook(
  p_webhook_secret text,
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
  v_expected_secret text;
begin
  select decrypted_secret
    into v_expected_secret
    from vault.decrypted_secrets
    where name = 'paddle_sandbox_webhook_secret'
    limit 1;

  if v_expected_secret is null
    or p_webhook_secret is null
    or extensions.digest(convert_to(v_expected_secret, 'UTF8'), 'sha256')
       <> extensions.digest(convert_to(p_webhook_secret, 'UTF8'), 'sha256') then
    raise exception 'authentication_failed' using errcode = '28000';
  end if;

  return query
    select * from public.process_paddle_event(
      p_event_id,
      p_event_type,
      p_occurred_at,
      p_payload_sha256,
      p_checkout_reference,
      p_price_id,
      p_provider_customer_id,
      p_provider_subscription_id,
      p_provider_transaction_id,
      p_subscription_status,
      p_trial_ends_at,
      p_current_period_end,
      p_cancel_at_period_end
    );
end;
$$;

revoke all on function private.process_paddle_event(
  text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) from public, anon, authenticated;
grant execute on function private.process_paddle_event(
  text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) to service_role;

revoke all on function webhook_private.process_paddle_event_from_webhook(
  text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) from public, anon, authenticated, service_role;
grant execute on function webhook_private.process_paddle_event_from_webhook(
  text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) to anon, service_role;
