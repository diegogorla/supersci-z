-- SUPER SCI-Z: identidade, conteúdo, cotas, assinaturas e privacidade.
-- Aplique em um projeto Supabase vazio. Nenhuma chave administrativa pertence ao navegador.

-- O projeto foi criado após a mudança de privilégios padrão da Data API. Ainda assim,
-- torne a política explícita para que objetos futuros não sejam publicados por acidente.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Projetos recentes podem trazer este event trigger de proteção no schema público.
-- Ele continua ativo, mas não deve ser invocável pela Data API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table public.reader_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  authority text not null default 'reader' check (authority in ('reader', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.reading_cycles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cycle_started_at timestamptz not null default now(),
  base_reads_used integer not null default 0 check (base_reads_used between 0 and 6),
  base_quota_exhausted_at timestamptz,
  bonus_reads_used integer not null default 0 check (bonus_reads_used between 0 and 4),
  updated_at timestamptz not null default now()
);
create table public.anonymous_readers (
  reader_id uuid primary key,
  cycle_started_at timestamptz not null default now(),
  reads_used integer not null default 0 check (reads_used between 0 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  plan_code text not null check (plan_code in ('founder_monthly', 'founder_annual', 'cosmos_monthly', 'cosmos_annual', 'lifetime')),
  provider text check (provider in ('paddle', 'dodo', 'paypal', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  status text not null check (status in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired', 'refunded')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user_status_created_idx on public.subscriptions(user_id, status, created_at desc) where user_id is not null;
create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_tier text not null default 'free' check (access_tier in ('free', 'founder', 'cosmos', 'lifetime')),
  source text not null default 'signup' check (source in ('signup', 'trial', 'subscription', 'lifetime_purchase', 'manual_grant')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  ads_enabled boolean not null default true,
  device_limit integer not null default 1 check (device_limit between 1 and 10),
  household_slots integer not null default 0 check (household_slots between 0 and 5),
  updated_at timestamptz not null default now()
);
create table public.article_reads (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  anonymous_reader_id uuid references public.anonymous_readers(reader_id) on delete cascade,
  article_slug text not null,
  read_at timestamptz not null default now(),
  cycle_started_at timestamptz not null,
  constraint article_reader_exactly_one check ((user_id is null) <> (anonymous_reader_id is null))
);
create unique index article_reads_registered_unique on public.article_reads(user_id, article_slug, cycle_started_at) where user_id is not null;
create unique index article_reads_anonymous_unique on public.article_reads(anonymous_reader_id, article_slug, cycle_started_at) where anonymous_reader_id is not null;
create index article_reads_user_cycle_idx on public.article_reads(user_id, cycle_started_at) where user_id is not null;
create table public.communication_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_opt_in boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  telegram_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  quiet_hours_start time not null default '20:00',
  quiet_hours_end time not null default '09:00',
  updated_at timestamptz not null default now()
);
create table public.communication_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'telegram', 'sms', 'instagram', 'facebook')),
  article_slug text,
  event_type text not null check (event_type in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'unsubscribed', 'failed', 'suppressed')),
  occurred_at timestamptz not null default now()
);
create index communication_events_frequency_idx on public.communication_events(user_id, channel, occurred_at desc);
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_email_hash text not null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (owner_user_id, member_email_hash)
);
create index household_members_accepted_user_idx on public.household_members(accepted_user_id) where accepted_user_id is not null;
create table public.access_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_hash)
);
create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_at timestamptz not null default now(), processed_at timestamptz, failure_code text
);
create unique index cancellation_one_open_request on public.cancellation_requests(subscription_id) where status in ('pending', 'processing');
create index cancellation_requests_subscription_idx on public.cancellation_requests(subscription_id);
create index cancellation_requests_user_idx on public.cancellation_requests(user_id);
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'completed', 'failed')),
  requested_at timestamptz not null default now(), processed_at timestamptz, failure_code text
);
create unique index account_deletion_one_open_request on public.account_deletion_requests(user_id) where status in ('pending', 'ready');
create index account_deletion_requests_user_idx on public.account_deletion_requests(user_id);
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null, provider_event_id text not null, event_type text not null,
  payload_sha256 text not null,
  status text not null check (status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(), processed_at timestamptz,
  unique (provider, provider_event_id)
);
create table public.articles (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz, updated_at timestamptz not null default now()
);
create table public.article_translations (
  article_slug text not null references public.articles(slug) on delete cascade,
  locale text not null check (locale in ('pt', 'en', 'es', 'zh', 'hi', 'ja', 'ru')),
  body jsonb not null check (jsonb_typeof(body) = 'array'),
  takeaways jsonb not null check (jsonb_typeof(takeaways) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (article_slug, locale)
);

alter table public.reader_profiles enable row level security;
alter table public.reading_cycles enable row level security;
alter table public.anonymous_readers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.article_reads enable row level security;
alter table public.communication_preferences enable row level security;
alter table public.communication_events enable row level security;
alter table public.household_members enable row level security;
alter table public.access_devices enable row level security;
alter table public.cancellation_requests enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.payment_events enable row level security;
alter table public.articles enable row level security;
alter table public.article_translations enable row level security;
revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.reader_profiles, public.reading_cycles, public.subscriptions, public.entitlements to authenticated;
grant select, insert, update on public.communication_preferences to authenticated;
grant select on public.communication_events, public.household_members, public.access_devices, public.cancellation_requests, public.account_deletion_requests to authenticated;
create policy reader_profile_select on public.reader_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy reading_cycle_select on public.reading_cycles for select to authenticated using ((select auth.uid()) = user_id);
create policy subscription_select on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy entitlement_select on public.entitlements for select to authenticated using ((select auth.uid()) = user_id);
create policy communication_preference_select on public.communication_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy communication_preference_insert on public.communication_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy communication_preference_update on public.communication_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy communication_event_select on public.communication_events for select to authenticated using ((select auth.uid()) = user_id);
create policy household_select on public.household_members for select to authenticated using ((select auth.uid()) = owner_user_id or (select auth.uid()) = accepted_user_id);
create policy device_select on public.access_devices for select to authenticated using ((select auth.uid()) = user_id);
create policy cancellation_select on public.cancellation_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy deletion_select on public.account_deletion_requests for select to authenticated using ((select auth.uid()) = user_id);

create function private.initialize_reader() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reader_profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.reading_cycles (user_id) values (new.id) on conflict do nothing;
  insert into public.communication_preferences (user_id) values (new.id) on conflict do nothing;
  insert into public.entitlements (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.initialize_reader();

create function private.get_my_reading_allowance() returns integer language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_cycle public.reading_cycles; v_unlimited boolean; v_bonus_earned integer := 0;
begin
  if v_user_id is null then return 0; end if;
  select exists (select 1 from public.entitlements e where e.user_id = v_user_id and e.access_tier in ('founder','cosmos','lifetime') and e.revoked_at is null and (e.valid_until is null or e.valid_until > now())) into v_unlimited;
  if v_unlimited then return 999999; end if;
  insert into public.reading_cycles (user_id) values (v_user_id) on conflict do nothing;
  select * into v_cycle from public.reading_cycles where user_id = v_user_id for update;
  if now() >= v_cycle.cycle_started_at + interval '30 days' then
    update public.reading_cycles set cycle_started_at = now(), base_reads_used = 0, base_quota_exhausted_at = null, bonus_reads_used = 0, updated_at = now() where user_id = v_user_id returning * into v_cycle;
  end if;
  if v_cycle.base_quota_exhausted_at is not null then
    v_bonus_earned := least(4, floor(greatest(0, extract(epoch from (now() - v_cycle.base_quota_exhausted_at))) / 604800)::integer);
  end if;
  return greatest(0, 6 - v_cycle.base_reads_used) + greatest(0, v_bonus_earned - v_cycle.bonus_reads_used);
end; $$;

create function private.consume_article_access(p_article_slug text, p_locale text, p_user_id uuid default null, p_reader_id uuid default null)
returns table (allowed boolean, remaining integer, reason text, body jsonb, takeaways jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  v_cycle public.reading_cycles; v_anon public.anonymous_readers; v_body jsonb; v_takeaways jsonb;
  v_unlimited boolean := false; v_existing boolean := false; v_bonus_earned integer := 0; v_available integer := 0;
begin
  if (p_user_id is null) = (p_reader_id is null) then return query select false,0,'invalid_identity',null::jsonb,null::jsonb; return; end if;
  select t.body,t.takeaways into v_body,v_takeaways from public.articles a join public.article_translations t on t.article_slug=a.slug where a.slug=p_article_slug and a.status='published' and t.locale=p_locale;
  if v_body is null then return query select false,0,'not_found',null::jsonb,null::jsonb; return; end if;
  if p_user_id is not null then
    if not exists (select 1 from public.reader_profiles where user_id=p_user_id) then return query select false,0,'profile_missing',null::jsonb,null::jsonb; return; end if;
    select exists (select 1 from public.entitlements e where e.user_id=p_user_id and e.access_tier in ('founder','cosmos','lifetime') and e.revoked_at is null and (e.valid_until is null or e.valid_until>now())) into v_unlimited;
    insert into public.reading_cycles(user_id) values(p_user_id) on conflict do nothing;
    select * into v_cycle from public.reading_cycles where user_id=p_user_id for update;
    if now() >= v_cycle.cycle_started_at + interval '30 days' then
      update public.reading_cycles set cycle_started_at=now(),base_reads_used=0,base_quota_exhausted_at=null,bonus_reads_used=0,updated_at=now() where user_id=p_user_id returning * into v_cycle;
    end if;
    select exists(select 1 from public.article_reads r where r.user_id=p_user_id and r.article_slug=p_article_slug and r.cycle_started_at=v_cycle.cycle_started_at) into v_existing;
    if v_unlimited or v_existing then
      insert into public.article_reads(user_id,article_slug,cycle_started_at) values(p_user_id,p_article_slug,v_cycle.cycle_started_at) on conflict do nothing;
      if v_unlimited then v_available:=999999;
      else
        if v_cycle.base_quota_exhausted_at is not null then v_bonus_earned:=least(4,floor(greatest(0,extract(epoch from(now()-v_cycle.base_quota_exhausted_at)))/604800)::integer); end if;
        v_available:=greatest(0,6-v_cycle.base_reads_used)+greatest(0,v_bonus_earned-v_cycle.bonus_reads_used);
      end if;
      return query select true,v_available,case when v_unlimited then 'unlimited' else 'already_counted' end,v_body,v_takeaways; return;
    end if;
    if v_cycle.base_quota_exhausted_at is not null then v_bonus_earned:=least(4,floor(greatest(0,extract(epoch from(now()-v_cycle.base_quota_exhausted_at)))/604800)::integer); end if;
    v_available:=greatest(0,6-v_cycle.base_reads_used)+greatest(0,v_bonus_earned-v_cycle.bonus_reads_used);
    if v_available<=0 then return query select false,0,'quota_exhausted',null::jsonb,null::jsonb; return; end if;
    insert into public.article_reads(user_id,article_slug,cycle_started_at) values(p_user_id,p_article_slug,v_cycle.cycle_started_at);
    if v_cycle.base_reads_used<6 then
      update public.reading_cycles set base_reads_used=base_reads_used+1,base_quota_exhausted_at=case when base_reads_used=5 then now() else base_quota_exhausted_at end,updated_at=now() where user_id=p_user_id returning * into v_cycle;
    else update public.reading_cycles set bonus_reads_used=bonus_reads_used+1,updated_at=now() where user_id=p_user_id returning * into v_cycle; end if;
    if v_cycle.base_quota_exhausted_at is not null then v_bonus_earned:=least(4,floor(greatest(0,extract(epoch from(now()-v_cycle.base_quota_exhausted_at)))/604800)::integer); end if;
    v_available:=greatest(0,6-v_cycle.base_reads_used)+greatest(0,v_bonus_earned-v_cycle.bonus_reads_used);
    return query select true,v_available,'counted',v_body,v_takeaways; return;
  end if;
  insert into public.anonymous_readers(reader_id) values(p_reader_id) on conflict do nothing;
  select * into v_anon from public.anonymous_readers where reader_id=p_reader_id for update;
  if now()>=v_anon.cycle_started_at+interval '30 days' then update public.anonymous_readers set cycle_started_at=now(),reads_used=0,updated_at=now() where reader_id=p_reader_id returning * into v_anon; end if;
  select exists(select 1 from public.article_reads r where r.anonymous_reader_id=p_reader_id and r.article_slug=p_article_slug and r.cycle_started_at=v_anon.cycle_started_at) into v_existing;
  if v_existing then return query select true,greatest(0,4-v_anon.reads_used),'already_counted',v_body,v_takeaways; return; end if;
  if v_anon.reads_used>=4 then return query select false,0,'quota_exhausted',null::jsonb,null::jsonb; return; end if;
  insert into public.article_reads(anonymous_reader_id,article_slug,cycle_started_at) values(p_reader_id,p_article_slug,v_anon.cycle_started_at);
  update public.anonymous_readers set reads_used=reads_used+1,updated_at=now() where reader_id=p_reader_id returning * into v_anon;
  return query select true,greatest(0,4-v_anon.reads_used),'counted',v_body,v_takeaways;
end; $$;

create function private.request_subscription_cancellation() returns table(state text,request_id uuid) language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_subscription public.subscriptions; v_request_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select * into v_subscription from public.subscriptions where user_id=v_user_id and status in('trialing','active','past_due','paused') order by created_at desc limit 1;
  if v_subscription.id is null then return query select 'no_active_subscription',null::uuid; return; end if;
  select id into v_request_id from public.cancellation_requests where subscription_id=v_subscription.id and status in('pending','processing') limit 1;
  if v_request_id is not null or v_subscription.cancel_at_period_end then return query select 'already_requested',v_request_id; return; end if;
  insert into public.cancellation_requests(user_id,subscription_id) values(v_user_id,v_subscription.id) returning id into v_request_id;
  return query select 'requested',v_request_id;
end; $$;

create function private.request_account_deletion() returns table(state text,request_id uuid) language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_subscription public.subscriptions; v_request_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  select id into v_request_id from public.account_deletion_requests where user_id=v_user_id and status in('pending','ready') limit 1;
  if v_request_id is null then insert into public.account_deletion_requests(user_id) values(v_user_id) returning id into v_request_id; end if;
  update public.communication_preferences set email_opt_in=false,whatsapp_opt_in=false,telegram_opt_in=false,sms_opt_in=false,updated_at=now() where user_id=v_user_id;
  select * into v_subscription from public.subscriptions where user_id=v_user_id and status in('trialing','active','past_due','paused') order by created_at desc limit 1;
  if v_subscription.id is not null then
    if not exists(select 1 from public.cancellation_requests where subscription_id=v_subscription.id and status in('pending','processing')) then insert into public.cancellation_requests(user_id,subscription_id) values(v_user_id,v_subscription.id); end if;
    return query select 'pending_cancellation',v_request_id; return;
  end if;
  update public.account_deletion_requests set status='ready' where id=v_request_id;
  return query select 'ready',v_request_id;
end; $$;

-- A Data API expõe apenas wrappers SECURITY INVOKER. Toda função privilegiada fica
-- no schema privado e valida a identidade antes de tocar dados do leitor.
create function public.get_my_reading_allowance() returns integer language sql security invoker set search_path = '' as $$
  select private.get_my_reading_allowance();
$$;
create function public.consume_article_access(p_article_slug text, p_locale text, p_user_id uuid default null, p_reader_id uuid default null)
returns table (allowed boolean, remaining integer, reason text, body jsonb, takeaways jsonb)
language sql security invoker set search_path = '' as $$
  select * from private.consume_article_access(p_article_slug, p_locale, p_user_id, p_reader_id);
$$;
create function public.request_subscription_cancellation() returns table(state text,request_id uuid)
language sql security invoker set search_path = '' as $$
  select * from private.request_subscription_cancellation();
$$;
create function public.request_account_deletion() returns table(state text,request_id uuid)
language sql security invoker set search_path = '' as $$
  select * from private.request_account_deletion();
$$;

revoke all on function private.initialize_reader() from public, anon, authenticated, service_role;
revoke all on function private.get_my_reading_allowance() from public, anon, authenticated, service_role;
revoke all on function private.consume_article_access(text,text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.request_subscription_cancellation() from public, anon, authenticated, service_role;
revoke all on function private.request_account_deletion() from public, anon, authenticated, service_role;
revoke all on function public.get_my_reading_allowance() from public, anon, authenticated, service_role;
revoke all on function public.consume_article_access(text,text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_subscription_cancellation() from public, anon, authenticated, service_role;
revoke all on function public.request_account_deletion() from public, anon, authenticated, service_role;

grant usage on schema private to authenticated, service_role;
grant execute on function private.get_my_reading_allowance() to authenticated;
grant execute on function private.request_subscription_cancellation() to authenticated;
grant execute on function private.request_account_deletion() to authenticated;
grant execute on function private.consume_article_access(text,text,uuid,uuid) to service_role;
grant execute on function public.get_my_reading_allowance() to authenticated;
grant execute on function public.request_subscription_cancellation() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.consume_article_access(text,text,uuid,uuid) to service_role;
