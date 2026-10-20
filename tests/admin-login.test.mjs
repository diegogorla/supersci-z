import assert from 'node:assert/strict';
import test from 'node:test';
import { default as worker } from '../dist/server/index.js';

const host = 'https://admin-fixture.supabase.co';
const env = { ASSETS: { fetch: async () => new Response('', { status: 404 }) }, NEXT_PUBLIC_SITE_URL: 'https://supersci-z.com', NEXT_PUBLIC_SUPABASE_URL: host, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const userId = '00000000-0000-4000-8000-000000000077';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.invalid', app_metadata: { provider: 'email' }, user_metadata: { authority: 'admin' }, created_at: new Date().toISOString() };
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 }) + '.fixture-signature';
let requestNumber = 0;

function request(body, origin = 'https://supersci-z.com') {
  return new Request('https://supersci-z.com/api/auth/admin-session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'cf-connecting-ip': `fixture-${++requestNumber}` }, body: JSON.stringify(body) });
}
const input = { email: user.email, password: 'fixture-password-not-real' };

// Vinext installs its fetch wrapper on the first request. Initialize it with a
// rejected request before installing provider mocks, without contacting Auth.
await worker.fetch(request(input, 'https://evil.invalid'), env, ctx);

function provider(t, options = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname);
    assert.equal(url.origin, host, 'tests never contact real providers');
    if (url.pathname === '/auth/v1/token') {
      assert.equal(url.searchParams.get('grant_type'), 'password');
      if (options.invalidPassword) return Response.json({ code: 'invalid_credentials', message: 'Invalid credentials' }, { status: 400 });
      return Response.json({ access_token: jwt, refresh_token: 'fixture-refresh-secret', token_type: 'bearer', expires_in: 3600, user: { ...user, factors: options.mfa ? [{ id: 'mfa', factor_type: 'totp', status: 'verified' }] : [] } });
    }
    if (url.pathname === '/rest/v1/reader_profiles') {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + userId);
      assert.equal(url.searchParams.get('select'), 'authority');
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      assert.equal(headers.get('authorization'), 'Bearer ' + jwt);
      if (options.profileError) return Response.json({ message: 'unavailable' }, { status: 503 });
      return Response.json(options.missing ? [] : [{ authority: options.role ?? 'admin' }]);
    }
    if (url.pathname === '/auth/v1/logout') {
      assert.equal(url.searchParams.get('scope'), 'local');
      return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected provider call: ' + url.pathname);
  });
  return calls;
}

test('administrator login returns only a fixed destination and secure session cookies', async t => {
  const calls = provider(t);
  const response = await worker.fetch(request(input), env, ctx);
  if (response.status !== 200) t.diagnostic(JSON.stringify(calls));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, next: '/conta' });
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some(value => value.includes('auth-token')));
  for (const cookie of cookies) { assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); }
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok(cookies.some(value => value.startsWith('sciz_owner_preview=') && value.includes('Max-Age=0')));
});

test('reader, editor, absent role and failed authority lookup receive no session cookies', async t => {
  for (const options of [{ role: 'reader' }, { role: 'editor' }, { missing: true }, { profileError: true }]) {
    await t.test(JSON.stringify(options), async sub => {
      const calls = provider(sub, options);
      const response = await worker.fetch(request(input), env, ctx);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'access_denied' });
      assert.equal(response.headers.getSetCookie().some(value => value.includes('auth-token')), false);
      assert.ok(calls.includes('/auth/v1/logout'), 'rejecting the account revokes only the new session');
    });
  }
});

test('a verified second factor cannot be bypassed by the password route', async t => {
  provider(t, { mfa: true });
  const response = await worker.fetch(request(input), env, ctx);
  assert.equal(response.status, 401);
  assert.equal(response.headers.getSetCookie().some(value => value.includes('auth-token')), false);
});

test('wrong passwords and non-admin users have the same public denial', async t => {
  provider(t, { invalidPassword: true });
  const response = await worker.fetch(request(input), env, ctx);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'access_denied' });
  assert.equal(response.headers.getSetCookie().some(value => value.includes('auth-token')), false);
});

test('cross-origin requests and attempts to supply roles or redirects are rejected before authentication', async t => {
  const calls = provider(t);
  const cross = await worker.fetch(request(input, 'https://evil.invalid'), env, ctx);
  assert.equal(cross.status, 403);
  for (const extra of [{ authority: 'admin' }, { next: 'https://evil.invalid' }]) {
    const response = await worker.fetch(request({ ...input, ...extra }), env, ctx);
    assert.equal(response.status, 400);
  }
  assert.deepEqual(calls, []);
});
