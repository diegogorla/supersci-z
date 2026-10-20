-- Keep Paddle Sandbox and Live records, credentials, and account actions
-- separated while preserving the already validated Sandbox flow.

alter table public.checkout_intents
  add column if not exists provider_environment text not null default 'sandbox'
  check (provider_environment in ('sandbox', 'live'));

alter table public.payment_events
  add column if not exists provider_environment text not null default 'sandbox'
  check (provider_environment in ('sandbox', 'live'));

alter table public.subscriptions
  add column if not exists provider_environment text not null default 'sandbox'
  check (provider_environment in ('sandbox', 'live'));

alter table public.entitlements
  add column if not exists provider_environment text
  check (provider_environment is null or provider_environment in ('sandbox', 'live'));

update public.entitlements as e
set provider_environment = 'sandbox'
where e.provider_environment is null
  and e.source in ('trial', 'subscription', 'lifetime_purchase')
  and exists (
    select 1
    from public.subscriptions as s
    where s.user_id = e.user_id
      and s.provider = 'paddle'
      and s.provider_environment = 'sandbox'
  );

create index if not exists checkout_intents_user_environment_status_idx
  on public.checkout_intents(user_id, provider_environment, status, expires_at desc);

create index if not exists subscriptions_user_environment_status_idx
  on public.subscriptions(user_id, provider_environment, status, created_at desc)
  where user_id is not null;

-- Existing processors omit provider_environment from INSERT statements. The
-- authenticated wrappers below set this transaction-local value first.
alter table public.checkout_intents alter column provider_environment set default
  (case when current_setting('app.paddle_environment', true) in ('sandbox', 'live')
    then current_setting('app.paddle_environment', true) else 'sandbox' end);
alter table public.payment_events alter column provider_environment set default
  (case when current_setting('app.paddle_environment', true) in ('sandbox', 'live')
    then current_setting('app.paddle_environment', true) else 'sandbox' end);
alter table public.subscriptions alter column provider_environment set default
  (case when current_setting('app.paddle_environment', true) in ('sandbox', 'live')
    then current_setting('app.paddle_environment', true) else 'sandbox' end);

create or replace function private.create_checkout_intent(
  p_plan_code text,
  p_price_id text,
  p_provider_environment text
)
returns table(intent_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_provider_environment not in ('sandbox', 'live') then raise exception 'invalid_environment'; end if;
  if p_plan_code not in ('founder_monthly', 'founder_annual', 'cosmos_monthly', 'cosmos_annual', 'lifetime') then
    raise exception 'invalid_plan';
  end if;
  if p_price_id !~ '^pri_[a-z0-9]{26}$' then raise exception 'invalid_price'; end if;

  update public.checkout_intents as ci
    set status = 'expired', updated_at = now()
    where ci.user_id = v_user_id
      and ci.provider_environment = p_provider_environment
      and ci.status = 'pending'
      and ci.expires_at <= now();

  return query
    insert into public.checkout_intents(user_id, plan_code, price_id, provider_environment)
    values (v_user_id, p_plan_code, p_price_id, p_provider_environment)
    returning public.checkout_intents.id, public.checkout_intents.expires_at;
end;
$$;

create or replace function public.create_checkout_intent(
  p_plan_code text,
  p_price_id text,
  p_provider_environment text
)
returns table(intent_id uuid, expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_checkout_intent(
    p_plan_code,
    p_price_id,
    p_provider_environment
  );
$$;

revoke all on function private.create_checkout_intent(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_checkout_intent(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.create_checkout_intent(text, text, text) to authenticated;
grant execute on function public.create_checkout_intent(text, text, text) to authenticated;

create or replace function webhook_private.process_paddle_event_from_webhook(
  p_provider_environment text,
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
  v_state text;
  v_user_id uuid;
begin
  if p_provider_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;

  select decrypted_secret
    into v_expected_secret
    from vault.decrypted_secrets
    where name = 'paddle_' || p_provider_environment || '_webhook_secret'
    limit 1;

  if v_expected_secret is null
    or p_webhook_secret is null
    or extensions.digest(convert_to(v_expected_secret, 'UTF8'), 'sha256')
       <> extensions.digest(convert_to(p_webhook_secret, 'UTF8'), 'sha256') then
    raise exception 'authentication_failed' using errcode = '28000';
  end if;

  perform set_config('app.paddle_environment', p_provider_environment, true);

  select result.state, result.affected_user_id
    into v_state, v_user_id
    from public.process_paddle_event(
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
    ) as result;

  if v_user_id is not null and v_state in ('processed', 'transaction_confirmed') then
    update public.entitlements
      set provider_environment = p_provider_environment
      where user_id = v_user_id
        and source in ('trial', 'subscription', 'lifetime_purchase');
  end if;

  return query select v_state, v_user_id;
end;
$$;

create or replace function public.process_paddle_event_from_webhook(
  p_provider_environment text,
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
language sql
security invoker
set search_path = ''
as $$
  select * from webhook_private.process_paddle_event_from_webhook(
    p_provider_environment,
    p_webhook_secret,
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
$$;

revoke all on function webhook_private.process_paddle_event_from_webhook(
  text,text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) from public, anon, authenticated, service_role;
grant execute on function webhook_private.process_paddle_event_from_webhook(
  text,text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) to anon, service_role;

revoke all on function public.process_paddle_event_from_webhook(
  text,text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) from public, anon, authenticated, service_role;
grant execute on function public.process_paddle_event_from_webhook(
  text,text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) to anon, service_role;

create or replace function private.request_subscription_cancellation(p_provider_environment text)
returns table(state text, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription public.subscriptions;
  v_request_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_provider_environment not in ('sandbox', 'live') then raise exception 'invalid_environment'; end if;

  select * into v_subscription
    from public.subscriptions
    where user_id = v_user_id
      and provider_environment = p_provider_environment
      and provider_subscription_id is not null
      and status in ('trialing', 'active', 'past_due', 'paused')
    order by created_at desc
    limit 1;

  if v_subscription.id is null then
    return query select 'no_active_subscription', null::uuid;
    return;
  end if;

  select id into v_request_id
    from public.cancellation_requests
    where subscription_id = v_subscription.id
      and status in ('pending', 'processing')
    limit 1;

  if v_request_id is not null or v_subscription.cancel_at_period_end then
    return query select 'already_requested', v_request_id;
    return;
  end if;

  insert into public.cancellation_requests(user_id, subscription_id)
    values (v_user_id, v_subscription.id)
    returning id into v_request_id;
  return query select 'requested', v_request_id;
end;
$$;

create or replace function public.request_subscription_cancellation(p_provider_environment text)
returns table(state text, request_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from private.request_subscription_cancellation(p_provider_environment);
$$;

create or replace function private.request_account_deletion(p_provider_environment text)
returns table(state text, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription public.subscriptions;
  v_request_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_provider_environment not in ('sandbox', 'live') then raise exception 'invalid_environment'; end if;

  select id into v_request_id
    from public.account_deletion_requests
    where user_id = v_user_id and status in ('pending', 'ready')
    limit 1;
  if v_request_id is null then
    insert into public.account_deletion_requests(user_id)
      values (v_user_id)
      returning id into v_request_id;
  end if;

  update public.communication_preferences
    set email_opt_in = false, whatsapp_opt_in = false, telegram_opt_in = false,
        sms_opt_in = false, updated_at = now()
    where user_id = v_user_id;

  select * into v_subscription
    from public.subscriptions
    where user_id = v_user_id
      and provider_environment = p_provider_environment
      and provider_subscription_id is not null
      and status in ('trialing', 'active', 'past_due', 'paused')
    order by created_at desc
    limit 1;

  if v_subscription.id is not null then
    if not exists (
      select 1 from public.cancellation_requests
      where subscription_id = v_subscription.id
        and status in ('pending', 'processing')
    ) then
      insert into public.cancellation_requests(user_id, subscription_id)
        values (v_user_id, v_subscription.id);
    end if;
    return query select 'pending_cancellation', v_request_id;
    return;
  end if;

  update public.account_deletion_requests set status = 'ready' where id = v_request_id;
  return query select 'ready', v_request_id;
end;
$$;

create or replace function public.request_account_deletion(p_provider_environment text)
returns table(state text, request_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from private.request_account_deletion(p_provider_environment);
$$;

revoke all on function private.request_subscription_cancellation(text)
  from public, anon, authenticated, service_role;
revoke all on function public.request_subscription_cancellation(text)
  from public, anon, authenticated, service_role;
revoke all on function private.request_account_deletion(text)
  from public, anon, authenticated, service_role;
revoke all on function public.request_account_deletion(text)
  from public, anon, authenticated, service_role;
grant execute on function private.request_subscription_cancellation(text) to authenticated;
grant execute on function public.request_subscription_cancellation(text) to authenticated;
grant execute on function private.request_account_deletion(text) to authenticated;
grant execute on function public.request_account_deletion(text) to authenticated;
