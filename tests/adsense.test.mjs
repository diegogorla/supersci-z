import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const oldEnv = {};
const env = { ADSENSE_ENABLED: 'true', ADSENSE_PUBLISHER_ID: 'ca-pub-1234143346239141', GOOGLE_CMP_ENABLED: 'true', MEMBERSHIP_ENABLED: 'false', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture' };
for (const [key, value] of Object.entries(env)) { oldEnv[key] = process.env[key]; process.env[key] = value; }
const vite = await createServer({ configFile: false, appType: 'custom', ssr: { noExternal: ['next'] }, resolve: { alias: { '@': root, 'server-only': root + 'node_modules/server-only/empty.js' } }, server: { middlewareMode: true, hmr: false }, plugins: [{
  name: 'adsense-entitlement-fixtures', enforce: 'pre',
  resolveId(id) {
    if (id === 'server-only') return '\0adsense-server-only';
    if (id === 'next/headers') return '\0adsense-cookies';
    if (/\/lib\/supabase\/server(?:\.ts)?$/.test(id.replace(/\\/g, '/'))) return '\0adsense-auth';
    if (/\/lib\/account\/server(?:\.ts)?$/.test(id.replace(/\\/g, '/'))) return '\0adsense-access';
  },
  load(id) {
    if (id === '\0adsense-server-only') return 'export {};';
    if (id === '\0adsense-cookies') return 'export async function cookies() { return { getAll: () => globalThis.__scizAdTest.cookies ?? [] }; } export async function headers() { return new Headers({ "x-nonce": "verification-nonce" }); }';
    if (id === '\0adsense-auth') return 'export async function createServerSupabaseClient() { return { auth: { getClaims: async () => { const s = globalThis.__scizAdTest; if (s.throwAuth) throw new Error("fixture auth failure"); return { data: s.claims === null ? null : { claims: s.claims }, error: s.claimsError ?? null }; } } }; }';
    if (id === '\0adsense-access') return 'export async function getAuthenticatedAccountContext() { return globalThis.__scizAdTest.context; }';
  },
}] });
test.after(async () => { await vite.close(); delete globalThis.__scizAdTest; for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
const { getPageAdConfig, getAdsenseVerificationPublisherId } = await vite.ssrLoadModule('/lib/adsense/server.ts');
const { isAdsenseRuntimeReady } = await vite.ssrLoadModule('/lib/adsense/config.ts');
function reader(tier, sharedAccess = false) {
  globalThis.__scizAdTest = { claims: { sub: 'reader-fixture' }, context: { user: { id: 'reader-fixture' }, entitlementResolved: true, effective: { accessTier: tier, adsEnabled: tier !== 'cosmos', sharedAccess } } };
}

test('ads remain disabled until configured prerequisites are present', async () => {
  reader('free');
  for (const key of ['ADSENSE_ENABLED', 'GOOGLE_CMP_ENABLED', 'ADSENSE_PUBLISHER_ID']) {
    const value = process.env[key]; process.env[key] = '';
    assert.equal(isAdsenseRuntimeReady(), false, key);
    assert.equal(await getPageAdConfig(), null, key);
    process.env[key] = value;
  }
});
test('advertising is limited to free and anonymous readers', async () => {
  reader('cosmos'); assert.equal(await getPageAdConfig(), null);
  reader('founder', true); assert.equal(await getPageAdConfig(), null);
  reader('lifetime'); assert.equal(await getPageAdConfig(), null);
  reader('free'); assert.equal((await getPageAdConfig()).experience, 'standard');
  globalThis.__scizAdTest = { claims: null, context: null, cookies: [] };
  assert.equal((await getPageAdConfig()).experience, 'standard');
});

test('Cosmos excludes the publisher script and every ad unit even if an ad flag is inconsistent', async () => {
  const { AdSenseVerification } = await vite.ssrLoadModule('/app/adsense-verification.tsx');
  for (const adsEnabled of [true, false, null, undefined]) {
    reader('cosmos');
    globalThis.__scizAdTest.context.effective.adsEnabled = adsEnabled;
    assert.equal(await getAdsenseVerificationPublisherId(), null);
    assert.equal(await AdSenseVerification(), null);
    assert.equal(await getPageAdConfig(), null);
  }
  reader('founder', true);
  assert.equal(await getPageAdConfig(), null, 'A Cosmos guest is a subscriber and remains ad-free');
});
test('introductory Multiplex unit is issued only for verified free or anonymous readers', async () => {
  for (const [tier, shared] of [['founder', false], ['lifetime', false], ['cosmos', false], ['founder', true]]) {
    reader(tier, shared);
    assert.equal((await getPageAdConfig())?.multiplexSlotId ?? null, null, tier);
  }
  reader('free');
  assert.equal((await getPageAdConfig()).multiplexSlotId, '6564696852');
  globalThis.__scizAdTest = { claims: null, context: null, cookies: [] };
  assert.equal((await getPageAdConfig()).multiplexSlotId, '6564696852');
  process.env.ADSENSE_PUBLISHER_ID = 'ca-pub-1111111111111111';
  try {
    assert.equal((await getPageAdConfig())?.multiplexSlotId ?? null, null, 'Do not attribute this slot to another publisher');
  } finally {
    process.env.ADSENSE_PUBLISHER_ID = env.ADSENSE_PUBLISHER_ID;
  }
});

test('publisher verification is present in initial head HTML while ad units remain disabled', async () => {
  const { AdSenseVerification } = await vite.ssrLoadModule('/app/adsense-verification.tsx');
  process.env.ADSENSE_ENABLED = 'false';
  try {
    for (const state of ['anonymous', 'free', 'founder', 'lifetime', 'cosmos']) {
      reader(state);
      if (state === 'anonymous') globalThis.__scizAdTest = { claims: null, context: null, cookies: [] };
      const eligible = ['anonymous', 'free'].includes(state);
      assert.equal(await getAdsenseVerificationPublisherId(), eligible ? env.ADSENSE_PUBLISHER_ID : null);
      assert.equal(await getPageAdConfig(), null);
      const script = await AdSenseVerification();
      const html = renderToStaticMarkup(createElement('html', null, createElement('head'), createElement('body', null, script)));
      if (eligible) {
        assert.match(html, /<head><script[^>]*async=""[^>]*src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234143346239141"[^>]*crossorigin="anonymous"[^>]*nonce="verification-nonce"[^>]*><\/script><\/head>/);
        assert.equal((html.match(/adsbygoogle\.js/g) ?? []).length, 1);
      } else assert.doesNotMatch(html, /adsbygoogle/);
    }
    globalThis.__scizAdTest = { claims: null, cookies: [{ name: 'sb-fixture-auth-token', value: 'uncertain' }] };
    assert.equal(await AdSenseVerification(), null);
  } finally {
    process.env.ADSENSE_ENABLED = 'true';
  }
});
test('an authenticated lookup failure does not replace paid benefits with ads', async () => {
  reader('cosmos'); globalThis.__scizAdTest.context = null;
  assert.equal(await getPageAdConfig(), null);
  reader('free'); globalThis.__scizAdTest.context.entitlementResolved = false;
  assert.equal(await getPageAdConfig(), null);
  reader('founder'); globalThis.__scizAdTest.context.user.id = 'different-reader';
  assert.equal(await getPageAdConfig(), null);
});

test('uncertain sessions never fall back to anonymous advertisements', async () => {
  const sessionCookie = [{ name: 'sb-fixture-auth-token.0', value: 'invalid-or-expired-fixture' }];
  const failures = [
    { claims: { sub: 'cosmos-reader' }, claimsError: { message: 'validation failed' }, cookies: sessionCookie },
    { claims: null, claimsError: { message: 'provider unavailable' }, cookies: [] },
    { claims: null, context: null, cookies: sessionCookie },
    { claims: {}, context: null, cookies: sessionCookie },
    { claims: {}, context: null, cookies: [] },
    { claims: { sub: 'cosmos-reader' }, throwAuth: true, cookies: sessionCookie },
  ];
  for (const state of failures) {
    globalThis.__scizAdTest = state;
    assert.equal(await getPageAdConfig(), null);
  }
  globalThis.__scizAdTest = { claims: null, context: null, cookies: [] };
  assert.equal((await getPageAdConfig()).experience, 'standard', 'A confirmed anonymous visitor remains eligible');
});
