-- Disambiguate the checkout_intents column from the function output field.
-- The previous unqualified expires_at reference raised PostgreSQL 42702 and
-- prevented every authenticated sandbox checkout from creating an intent.

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

  update public.checkout_intents as ci
    set status = 'expired', updated_at = now()
    where ci.user_id = v_user_id
      and ci.status = 'pending'
      and ci.expires_at <= now();

  return query
    insert into public.checkout_intents(user_id, plan_code, price_id)
    values (v_user_id, p_plan_code, p_price_id)
    returning public.checkout_intents.id, public.checkout_intents.expires_at;
end;
$$;

revoke all on function private.create_checkout_intent(text, text) from public, anon, authenticated, service_role;
grant execute on function private.create_checkout_intent(text, text) to authenticated;
