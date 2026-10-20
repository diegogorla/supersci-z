import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const vite = await createServer({
  root, configFile: false, appType: 'custom',
  resolve: { alias: { '@': root, 'server-only': root + 'node_modules/server-only/empty.js' } },
  server: { middlewareMode: true, hmr: false },
  plugins: [{
    name: 'privacy-dto-fixtures', enforce: 'pre',
    resolveId(id) {
      const path = id.replace(/\\/g, '/');
      if (id === 'server-only') return '\0privacy-empty';
      if (/\/lib\/supabase\/server(?:\.ts)?$/.test(path)) return '\0privacy-auth';
      if (/\/lib\/supabase\/admin(?:\.ts)?$/.test(path)) return '\0privacy-admin';
      if (/\/lib\/supabase\/config(?:\.ts)?$/.test(path)) return '\0privacy-config';
      if (/\/lib\/paddle\/config(?:\.ts)?$/.test(path)) return '\0privacy-paddle';
    },
    load(id) {
      if (id === '\0privacy-empty') return 'export {};';
      if (id === '\0privacy-auth') return 'export async function createServerSupabaseClient() { return globalThis.__scizPrivacy.auth; }';
      if (id === '\0privacy-admin') return 'export function createAdminSupabaseClient() { return globalThis.__scizPrivacy.admin; }';
      if (id === '\0privacy-config') return 'export function isSupabaseConfigured() { return true; }';
      if (id === '\0privacy-paddle') return 'export function getPaddleEnvironment() { return "live"; }';
    },
  }],
});
test.after(async () => { await vite.close(); delete globalThis.__scizPrivacy; });
const { getViewerSummary } = await vite.ssrLoadModule('/lib/account/viewer.ts');
const { getPublishedArticleComments } = await vite.ssrLoadModule('/lib/account/comments.ts');

test('public viewer DTO returns benefits without account identifiers or names', async () => {
  const id = '00000000-0000-4000-8000-000000000123';
  const user = { id, email: 'private-reader@example.invalid', user_metadata: { name: 'Private fixture name' } };
  const auth = {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: id } }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
    },
    rpc: async () => ({ data: [{ access_tier: 'founder', owner_user_id: '00000000-0000-4000-8000-000000000456' }], error: null }),
    from: () => ({
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: null, error: null }),
    }),
  };
  globalThis.__scizPrivacy = { auth };
  assert.deepEqual(await getViewerSummary(), { accessTier: 'founder', sharedAccess: true });
  user.id = '00000000-0000-4000-8000-000000000999';
  assert.equal(await getViewerSummary(), null, 'A verified identity mismatch must not render another profile');
});

test('public comment DTO keeps content and date without private identities', async () => {
  const row = {
    id: 'private-comment-id', user_id: 'private-reader-id',
    author_display_name: 'Private author fixture', email: 'private-author@example.invalid',
    body: 'A published scientific observation.', created_at: '2026-09-07T12:00:00Z',
  };
  let failed = false;
  const query = {
    select() { return this; }, eq() { return this; }, order() { return this; },
    limit: async () => ({ data: [row], error: failed ? { message: 'fixture failure' } : null }),
  };
  globalThis.__scizPrivacy = { admin: { from: () => query } };
  assert.deepEqual(await getPublishedArticleComments('fixture-article'), [{
    author: 'Leitor SCI-Z', body: row.body, createdAt: row.created_at,
  }]);
  failed = true;
  assert.deepEqual(await getPublishedArticleComments('fixture-article'), []);
});
