-- Let the public webhook route process a verified Paddle event without carrying
-- the Supabase service-role key. The route supplies the notification secret it
-- has already verified; this narrow wrapper compares its digest with Vault and
-- only then delegates to the existing atomic processor.

create or replace function public.process_paddle_event_from_webhook(
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
    select * from private.process_paddle_event(
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

revoke all on function public.process_paddle_event_from_webhook(
  text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) from public, anon, authenticated, service_role;

grant execute on function public.process_paddle_event_from_webhook(
  text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) to anon, service_role;

comment on function public.process_paddle_event_from_webhook(
  text,text,text,timestamptz,text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean
) is 'Paddle webhook bridge authenticated by the notification secret stored in Vault.';
