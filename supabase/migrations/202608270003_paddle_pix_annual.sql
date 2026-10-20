-- SUPER SCI-Z: annual Founder access paid once by Pix, without renewal.

create or replace function private.process_paddle_annual_pix_event(
  p_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payload_sha256 text,
  p_checkout_reference uuid,
  p_price_id text,
  p_provider_customer_id text,
  p_provider_transaction_id text
)
returns table(state text, affected_user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_intent public.checkout_intents; v_subscription_id uuid; v_valid_until timestamptz;
begin
  if p_event_id !~ '^evt_[a-z0-9]{26}$' or p_payload_sha256 !~ '^[a-f0-9]{64}$'
    or p_event_type <> 'transaction.completed' or p_provider_transaction_id is null then
    return query select 'invalid_event', null::uuid; return;
  end if;
  begin
    insert into public.payment_events(provider, provider_event_id, event_type, payload_sha256, status, occurred_at)
    values ('paddle', p_event_id, p_event_type, p_payload_sha256, 'received', p_occurred_at);
  exception when unique_violation then
    return query select 'duplicate', null::uuid; return;
  end;

  select * into v_intent from public.checkout_intents
    where id=p_checkout_reference limit 1 for update;
  if v_intent.id is null or v_intent.plan_code <> 'founder_annual'
    or (v_intent.status='pending' and v_intent.expires_at<=now()) then
    update public.payment_events set status='failed',processed_at=now()
      where provider='paddle' and provider_event_id=p_event_id;
    return query select 'invalid_checkout_reference', null::uuid; return;
  end if;
  if p_price_id is null or p_price_id <> v_intent.price_id then
    update public.payment_events set status='failed',processed_at=now()
      where provider='paddle' and provider_event_id=p_event_id;
    return query select 'price_mismatch', null::uuid; return;
  end if;

  v_valid_until := p_occurred_at + interval '1 year';
  insert into public.subscriptions(
    user_id,plan_code,provider,provider_customer_id,provider_transaction_id,
    status,current_period_end,provider_updated_at
  ) values (
    v_intent.user_id,'founder_annual','paddle',p_provider_customer_id,p_provider_transaction_id,
    'active',v_valid_until,p_occurred_at
  )
  on conflict (provider,provider_transaction_id) where provider_transaction_id is not null
  do update set provider_customer_id=excluded.provider_customer_id,
    status='active',current_period_end=excluded.current_period_end,
    provider_updated_at=excluded.provider_updated_at,updated_at=now()
  returning id into v_subscription_id;

  insert into public.entitlements(
    user_id,access_tier,source,valid_from,valid_until,revoked_at,
    ads_enabled,device_limit,household_slots,updated_at
  ) values (
    v_intent.user_id,'founder','subscription',p_occurred_at,v_valid_until,null,true,1,0,now()
  )
  on conflict (user_id) do update set access_tier='founder',source='subscription',
    valid_from=excluded.valid_from,valid_until=excluded.valid_until,revoked_at=null,
    ads_enabled=true,device_limit=1,household_slots=0,updated_at=now();

  update public.checkout_intents set status='completed',provider_transaction_id=p_provider_transaction_id,updated_at=now()
    where id=v_intent.id;
  update public.payment_events set status='processed',processed_at=now()
    where provider='paddle' and provider_event_id=p_event_id;
  return query select 'processed',v_intent.user_id;
end; $$;

create or replace function public.process_paddle_event(
  p_event_id text, p_event_type text, p_occurred_at timestamptz,
  p_payload_sha256 text, p_checkout_reference uuid, p_price_id text,
  p_provider_customer_id text, p_provider_subscription_id text,
  p_provider_transaction_id text, p_subscription_status text,
  p_trial_ends_at timestamptz, p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns table(state text, affected_user_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare v_plan_code text;
begin
  if p_checkout_reference is not null then
    select plan_code into v_plan_code from public.checkout_intents where id=p_checkout_reference;
  end if;
  if p_event_type='transaction.completed' and p_provider_subscription_id is null and v_plan_code='founder_annual' then
    return query select * from private.process_paddle_annual_pix_event(
      p_event_id,p_event_type,p_occurred_at,p_payload_sha256,p_checkout_reference,
      p_price_id,p_provider_customer_id,p_provider_transaction_id
    );
  else
    return query select * from private.process_paddle_event(
      p_event_id,p_event_type,p_occurred_at,p_payload_sha256,p_checkout_reference,
      p_price_id,p_provider_customer_id,p_provider_subscription_id,
      p_provider_transaction_id,p_subscription_status,p_trial_ends_at,
      p_current_period_end,p_cancel_at_period_end
    );
  end if;
end; $$;

revoke all on function private.process_paddle_annual_pix_event(text,text,timestamptz,text,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.process_paddle_annual_pix_event(text,text,timestamptz,text,uuid,text,text,text) to service_role;

create or replace function private.request_subscription_cancellation()
returns table(state text,request_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_subscription public.subscriptions; v_request_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_subscription from public.subscriptions
    where user_id=v_user_id and provider_subscription_id is not null
      and status in('trialing','active','past_due','paused')
    order by created_at desc limit 1;
  if v_subscription.id is null then return query select 'no_active_subscription',null::uuid; return; end if;
  select id into v_request_id from public.cancellation_requests
    where subscription_id=v_subscription.id and status in('pending','processing') limit 1;
  if v_request_id is not null or v_subscription.cancel_at_period_end then
    return query select 'already_requested',v_request_id; return;
  end if;
  insert into public.cancellation_requests(user_id,subscription_id)
    values(v_user_id,v_subscription.id) returning id into v_request_id;
  return query select 'requested',v_request_id;
end; $$;

