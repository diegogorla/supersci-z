import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL engine in memory; no production connection or customer data.
// PGlite serializes connections, so cross-connection lock contention remains a staging check.
test('database enforces reader quotas, rolls back batches and preserves role restrictions', async () => {
 const db = new PGlite();
 try {
  await db.exec([
   'create schema auth; create schema private;',
   'create role anon; create role authenticated; create role service_role bypassrls;',
   'grant usage on schema public,private to service_role;',
   'create table auth.users(id uuid primary key);',
   'create table public.articles(slug text primary key);',
   "insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002'), ('00000000-0000-4000-8000-000000000003');",
   "insert into public.articles values ('fixture');"
  ].join('\n'));
  const original = await readFile(new URL('../supabase/migrations/20260901183616_plan_benefits_and_live_access.sql',import.meta.url),'utf8');
  await db.exec(original.slice(original.indexOf('create table if not exists public.article_comments'),original.indexOf('create or replace function private.resolve_effective_access')));
  await db.exec(await readFile(new URL('../supabase/migrations/20260907082000_reader_submission_limits.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const comment = (user) => db.query("insert into public.article_comments(article_slug,user_id,author_display_name,body) values ('fixture',$1,'Leitor','Comentário de teste')",[user]);
  const question = (user) => db.query("insert into public.editorial_questions(user_id,body) values ($1,'Pergunta de teste do leitor')",[user]);
  const user = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  for (let i=0;i<5;i++) await comment(user);
  await assert.rejects(comment(user),{code:'P0001',message:'reader_rate_limit'});
  await comment(other);
  for (let i=0;i<3;i++) await question(user);
  await assert.rejects(question(user),{code:'P0001',message:'reader_rate_limit'});
  await question(other);
  assert.equal((await db.query('select count(*)::integer as total from public.article_comments')).rows[0].total,6);
  await db.query("update public.article_comments set created_at = now() - interval '25 hours' where user_id=$1",[user]);
  await comment(user);
  await assert.rejects(db.exec("insert into public.article_comments(article_slug,user_id,author_display_name,body) select 'fixture','00000000-0000-4000-8000-000000000003','Leitor','Teste de lote' from generate_series(1,6)"),{code:'P0001'});
  assert.equal((await db.query("select count(*)::integer as total from public.article_comments where user_id='00000000-0000-4000-8000-000000000003'")).rows[0].total,0);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(question(user),{code:'42501'});
  await db.exec('reset role; set role anon');
  await assert.rejects(comment(user),{code:'42501'});
  await db.exec('reset role');
  const rights = await db.query("select has_function_privilege('anon','private.enforce_reader_submission_limit()','execute') as anon, has_function_privilege('authenticated','private.enforce_reader_submission_limit()','execute') as reader");
  assert.deepEqual(rights.rows[0],{anon:false,reader:false});
 } finally { await db.close(); }
});
