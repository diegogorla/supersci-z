-- Let the server record an authenticated paid device when the account area opens.
-- The public wrapper remains executable only by service_role.

create or replace function public.register_access_device(
  p_user_id uuid,
  p_device_hash text,
  p_device_label text,
  p_provider_environment text
)
returns table(allowed boolean, active_count integer, allowed_count integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.register_access_device(
    p_user_id, p_device_hash, p_device_label, p_provider_environment
  );
$$;

revoke all on function public.register_access_device(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_access_device(uuid, text, text, text)
  to service_role;
