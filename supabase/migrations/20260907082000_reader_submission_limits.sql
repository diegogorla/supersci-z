-- Security-only migration: no management tables, plan changes or publishing actions.
-- Preserve existing per-reader rolling 24-hour limits under concurrent inserts.
create or replace function private.enforce_reader_submission_limit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_count bigint; v_limit integer;
begin
  if tg_table_schema <> 'public' or tg_table_name not in ('article_comments','editorial_questions') then
    raise exception 'unsupported_submission_table' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reader-submit:' || tg_table_name || ':' || new.user_id::text, 0)
  );
  if tg_table_name = 'article_comments' then
    v_limit := 5;
    select count(*) into v_count from public.article_comments
      where user_id = new.user_id and created_at >= pg_catalog.clock_timestamp() - interval '24 hours';
  else
    v_limit := 3;
    select count(*) into v_count from public.editorial_questions
      where user_id = new.user_id and created_at >= pg_catalog.clock_timestamp() - interval '24 hours';
  end if;
  if v_count >= v_limit then
    raise exception 'reader_rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function private.enforce_reader_submission_limit() from public, anon, authenticated;
grant execute on function private.enforce_reader_submission_limit() to service_role;

create trigger article_comments_submission_limit
  before insert on public.article_comments
  for each row execute function private.enforce_reader_submission_limit();
create trigger editorial_questions_submission_limit
  before insert on public.editorial_questions
  for each row execute function private.enforce_reader_submission_limit();
