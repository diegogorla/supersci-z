import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextResponse } from 'next/server.js';

globalThis.__ownerPreviewNextResponse = NextResponse;

// Directory URLs have a trailing slash; normalize it before matching module IDs.
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const oldEnv = {};
const env = { NODE_ENV: 'production', ADSENSE_ENABLED: 'true', ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456', ADSENSE_FEED_SLOT_ID: '1234567890', ADSENSE_ARTICLE_SLOT_ID: '9876543210', GOOGLE_CMP_ENABLED: 'true' };
for (const [key, value] of Object.entries(env)) { oldEnv[key] = process.env[key]; process.env[key] = value; }
const vite = await createServer({
  configFile: false, root, appType: 'custom', ssr: { noExternal: ['next'] },
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  resolve: { alias: { '@': root, 'server-only': root + '/node_modules/server-only/empty.js', 'next/headers': '\0preview-headers', 'next/server': '\0preview-response', 'next/navigation': '\0preview-navigation', 'next/link': '\0preview-link', 'next/image': '\0preview-image' } }, server: { middlewareMode: true, hmr: false },
  plugins: [{
    name: 'owner-preview-fixtures', enforce: 'pre',
    transform(code, id) {
      if (id.replace(/\\/g, '/').startsWith(root + '/') && !id.includes('node_modules')) {
        return code.replace(/(["'])next\/(headers|server|navigation|link|image)\1/g, (_match, _quote, name) => '"owner-preview-fixture:' + (name === 'server' ? 'response' : name) + '"');
      }
    },
    resolveId(id) {
      const normalized = id.replace(/\\/g, '/');
      if (id.startsWith('owner-preview-fixture:')) return '\0preview-' + id.slice('owner-preview-fixture:'.length);
      if (id === 'server-only') return '\0preview-empty';
      if (id === 'next/headers') return '\0preview-headers';
      if (id === 'next/server') return '\0preview-response';
      if (id === 'next/navigation') return '\0preview-navigation';
      for (const [path, fixture] of [
        ['lib/supabase/server', 'auth'], ['lib/supabase/admin', 'admin'],
        ['lib/supabase/config', 'config'], ['lib/supabase/server-config', 'runtime'],
        ['lib/security/reader-cookie', 'reader'], ['lib/content/public', 'content'],
      ]) if (normalized.endsWith('/' + path) || normalized.endsWith('/' + path + '.ts')) return '\0preview-' + fixture;
    },
    load(id) {
      if (id === '\0preview-empty') return 'export {};';
      if (id === '\0preview-response') return 'export const NextResponse = globalThis.__ownerPreviewNextResponse;';
      if (id === '\0preview-navigation') return 'export function useRouter() { return { replace() {}, refresh() {}, push() {} }; } export function usePathname() { return "/revista"; }';
      if (id === '\0preview-link') return 'import { createElement } from "react"; export default function Link(props) { return createElement("a", props); }';
      if (id === '\0preview-image') return 'import { createElement } from "react"; export default function Image({ priority, unoptimized, ...props }) { return createElement("img", props); }';
      if (id === '\0preview-headers') return 'export async function cookies() { return { get: (name) => name === "sciz_owner_preview" && globalThis.__ownerPreviewTest.cookie ? { value: globalThis.__ownerPreviewTest.cookie } : undefined, getAll: () => [] }; } export async function headers() { return new Headers(); }';
      if (id === '\0preview-config') return 'export function isSupabaseConfigured() { return true; } export function getPublicSupabaseConfig() { return { url: "https://fixture.supabase.co", key: "fixture" }; }';
      if (id === '\0preview-runtime') return 'export function isMembershipRuntimeReady() { return globalThis.__ownerPreviewTest.runtime !== false; }';
      if (id === '\0preview-reader') return 'export const READER_COOKIE = "reader"; export async function verifyReaderCookie() { return "verified-reader"; } export async function hashReaderDevice() { return "verified-device"; }';
      if (id === '\0preview-content') return 'export async function getOpenArticleContent() { return null; }';
      if (id === '\0preview-auth') return 'export async function createServerSupabaseClient() { return { auth: { getUser: async () => { const s = globalThis.__ownerPreviewTest; s.authCalls++; if (s.authThrows) throw new Error("unavailable"); return { data: { user: s.user }, error: s.authError ?? null }; }, getClaims: async () => ({ data: { claims: { sub: globalThis.__ownerPreviewTest.user?.id } }, error: null }) }, from: (table) => { const s = globalThis.__ownerPreviewTest; assertTable(table); s.profileCalls++; return { select: (fields) => { s.selected = fields; return { eq: (column, value) => { s.filter = [column, value]; return { maybeSingle: async () => ({ data: s.role === null ? null : { authority: s.role }, error: s.profileError ?? null }) }; } }; } }; } }; } function assertTable(table) { if (table !== "reader_profiles") throw new Error("unexpected table " + table); }';
      if (id === '\0preview-admin') return 'export function createAdminSupabaseClient() { const s = globalThis.__ownerPreviewTest; s.adminCalls++; return { rpc: async (name) => { s.rpcCalls.push(name); if (name === "get_server_open_article_content") return { data: s.contentFailure ? null : { body: ["Public published fixture"], takeaways: ["Fixture takeaway"] }, error: s.contentFailure ? { message: "unavailable" } : null }; if (name === "consume_article_access_v2") return { data: { allowed: false, remaining: 0, reason: "quota_exhausted" }, error: null }; throw new Error("unexpected RPC " + name); } }; }';
    },
  }],
});
test.after(async () => {
  await vite.close(); delete globalThis.__ownerPreviewTest; delete globalThis.__ownerPreviewNextResponse;
  for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
const model = await vite.ssrLoadModule('/lib/owner-preview/model.ts');
const { getOwnerPreview, isVerifiedPreviewOwner } = await vite.ssrLoadModule('/lib/owner-preview/server.ts');
const previewRoute = await vite.ssrLoadModule('/app/api/owner-preview/route.ts');
const { getPageAdConfig } = await vite.ssrLoadModule('/lib/adsense/server.ts');
const { getProtectedArticleAccess } = await vite.ssrLoadModule('/lib/content/protected.ts');
const { getViewerSummary } = await vite.ssrLoadModule('/lib/account/viewer.ts');
const checkoutRoute = await vite.ssrLoadModule('/app/api/paddle/checkout/route.ts');
const commentsRoute = await vite.ssrLoadModule('/app/api/account/comments/route.ts');

function fixture(overrides = {}) {
  globalThis.__ownerPreviewTest = {
    user: { id: 'verified-owner-fixture', user_metadata: { authority: 'admin' } },
    role: 'admin', cookie: 'cosmos:available', authCalls: 0, profileCalls: 0, adminCalls: 0, rpcCalls: [], ...overrides,
  };
  return globalThis.__ownerPreviewTest;
}
function request(body, origin = 'https://supersci-z.com', path = '/api/owner-preview') {
  return new Request('https://supersci-z.com' + path, {
    method: 'POST', headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': origin === 'https://supersci-z.com' ? 'same-origin' : 'cross-site' },
    body: JSON.stringify(body),
  });
}

test('cookie accepts only named visual profiles and the visitor quota demonstration', () => {
  for (const mode of model.OWNER_PREVIEW_MODES) assert.deepEqual(model.parseOwnerPreviewCookie(mode + ':available'), { mode, exhausted: false });
  assert.deepEqual(model.parseOwnerPreviewCookie('visitor:exhausted'), { mode: 'visitor', exhausted: true });
  for (const input of [undefined, '', '__proto__:available', 'admin:available', 'cosmos:exhausted', 'visitor:available:admin', 'visitor', '{"authority":"admin"}', 'cosmos:available;admin=1']) {
    assert.equal(model.parseOwnerPreviewCookie(input), null);
  }
});

test('ordinary requests with no preview cookie incur no owner authorization lookup', async () => {
  const s = fixture({ cookie: undefined });
  assert.equal(await getOwnerPreview(), null);
  assert.equal(s.authCalls, 0); assert.equal(s.profileCalls, 0);
});

test('a forged cookie, user metadata or editor role never grants preview authority', async () => {
  for (const role of ['reader', 'editor', null, 'ADMIN']) {
    const s = fixture({ role });
    assert.equal(await getOwnerPreview(), null);
    assert.equal(await isVerifiedPreviewOwner(), false);
    assert.equal(s.selected, 'authority');
    assert.deepEqual(s.filter, ['user_id', 'verified-owner-fixture']);
  }
});

test('session, provider and profile failures deny owner preview', async () => {
  for (const input of [{ user: null }, { authError: { message: 'expired' } }, { authThrows: true }, { profileError: { message: 'unavailable' } }]) {
    fixture(input); assert.equal(await getOwnerPreview(), null);
  }
});

test('a revoked owner role or ended session is rejected on the next request', async () => {
  const s = fixture();
  assert.equal((await getOwnerPreview()).mode, 'cosmos');
  s.role = 'reader';
  assert.equal(await getOwnerPreview(), null);
  s.role = 'admin'; s.user = null;
  assert.equal(await getOwnerPreview(), null);
  assert.equal(s.authCalls, 3);
});

test('Cosmos guest is a shared Founder presentation; every subscriber remains ad-free', async () => {
  fixture({ cookie: 'cosmos_guest:available' });
  assert.deepEqual(await getViewerSummary(), { accessTier: 'founder', sharedAccess: true });
  assert.equal((await getOwnerPreview()).experience, 'none');
  fixture({ cookie: 'lifetime:available' });
  assert.deepEqual(await getViewerSummary(), { accessTier: 'lifetime', sharedAccess: false });
  assert.equal((await getOwnerPreview()).experience, 'none');
  fixture({ cookie: 'visitor:available' });
  assert.equal(await getViewerSummary(), null);
});

test('preview cannot be selected cross-origin, with unknown fields or by a non-owner', async () => {
  let s = fixture();
  assert.equal((await previewRoute.POST(request({ mode: 'cosmos' }, 'https://untrusted.example'))).status, 403);
  assert.equal(s.authCalls, 0);
  for (const body of [{ mode: 'admin' }, { mode: 'cosmos', authority: 'admin' }, { mode: 'cosmos', exhausted: true }, { mode: null, exhausted: true }]) {
    s = fixture(); const response = await previewRoute.POST(request(body));
    assert.equal(response.status, 400); assert.equal(response.headers.get('set-cookie'), null); assert.equal(s.authCalls, 0);
  }
  fixture({ role: 'reader' });
  const response = await previewRoute.POST(request({ mode: 'cosmos' }));
  assert.equal(response.status, 403); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(previewRoute.GET, undefined);
});

test('owner selection sets only a short host-only HttpOnly cookie; exit deletes it', async () => {
  const s = fixture();
  const response = await previewRoute.POST(request({ mode: 'visitor', exhausted: true }, undefined, '/api/owner-preview?mode=cosmos'));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /sciz_owner_preview=visitor%3Aexhausted/);
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=strict/i);
  assert.match(cookie, /Max-Age=1800/i); assert.match(cookie, /Path=\//i); assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(s.adminCalls, 0);
  const exit = await previewRoute.POST(request({ mode: null }));
  assert.equal(exit.status, 200); assert.match(exit.headers.get('set-cookie'), /Max-Age=0/i);
});

test('every authorized preview suppresses real ads even when ad configuration is complete', async () => {
  for (const mode of model.OWNER_PREVIEW_MODES) {
    fixture({ cookie: mode + ':available' });
    assert.equal(await getPageAdConfig(), null, mode);
  }
});

test('article previews read published content without consuming real credits or registering devices', async () => {
  for (const mode of model.OWNER_PREVIEW_MODES) {
    const s = fixture({ cookie: mode + ':available' });
    const access = await getProtectedArticleAccess({ slug: 'published-fixture' }, 'pt');
    assert.equal(access.allowed, true); assert.equal(access.reason, 'owner_preview');
    assert.deepEqual(s.rpcCalls, ['get_server_open_article_content']);
    assert.equal(access.remaining, mode === 'visitor' ? 3 : 999999);
  }
});

test('visitor quota demonstration sends no body and makes no content RPC, including before cutover', async () => {
  for (const runtime of [true, false]) {
    const s = fixture({ cookie: 'visitor:exhausted', runtime });
    const access = await getProtectedArticleAccess({ slug: 'published-fixture' }, 'pt');
    assert.equal(access.allowed, false); assert.equal(access.reason, 'quota_exhausted');
    assert.equal(access.body, null); assert.equal(access.takeaways, null); assert.equal(s.adminCalls, 0);
  }
});

test('untrusted preview cookies cannot bypass the real article meter', async () => {
  const s = fixture({ role: 'reader' });
  const access = await getProtectedArticleAccess({ slug: 'published-fixture' }, 'pt');
  assert.equal(access.allowed, false); assert.equal(access.body, null);
  assert.deepEqual(s.rpcCalls, ['consume_article_access_v2']);
});

test('preview content failures remain closed without using the metered grant RPC', async () => {
  const s = fixture({ contentFailure: true });
  const access = await getProtectedArticleAccess({ slug: 'missing-fixture' }, 'pt');
  assert.equal(access.allowed, false); assert.equal(access.body, null); assert.equal(access.reason, 'service_unavailable');
  assert.deepEqual(s.rpcCalls, ['get_server_open_article_content']);
});

test('preview checkout and comment POSTs are blocked before mutations, including live query', async () => {
  for (const [route, path, body] of [
    [checkoutRoute, '/api/paddle/checkout?live=1', { plan: 'cosmos_monthly' }],
    [commentsRoute, '/api/account/comments', { articleSlug: 'published-fixture', body: 'Fixture comment' }],
  ]) {
    const s = fixture();
    const response = await route.POST(request(body, undefined, path));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'owner_preview_active' });
    assert.equal(s.adminCalls, 0); assert.deepEqual(s.rpcCalls, []);
  }
});

test('ad placeholders and simulated comment forms never render Google markup or active submission', async () => {
  const { OwnerPreviewAd } = await vite.ssrLoadModule('/app/owner-preview-ad.tsx');
  const { ArticleComments } = await vite.ssrLoadModule('/app/article-comments.tsx');
  const ad = renderToStaticMarkup(createElement(OwnerPreviewAd, { placement: 'article' }));
  assert.match(ad, /Espaço publicitário ilustrativo/);
  assert.doesNotMatch(ad, /adsbygoogle|<script|data-ad-client|data-ad-slot/);
  const form = renderToStaticMarkup(createElement(ArticleComments, { articleSlug: 'fixture', locale: 'pt', comments: [], canComment: true, preview: true }));
  assert.match(form, /Formulário demonstrativo/); assert.match(form, /textarea[^>]*disabled/); assert.match(form, /button[^>]*disabled/);
});

test('magazine previews include the introductory placement only for non-subscribers', async () => {
  const { default: MagazineHome } = await vite.ssrLoadModule('/app/magazine-home.tsx');
  for (const [mode, count] of [['visitor', 1], ['founder', 0], ['cosmos', 0], ['cosmos_guest', 0], ['lifetime', 0]]) {
    const preview = model.ownerPreviewProfile({ mode, exhausted: false });
    const html = renderToStaticMarkup(createElement(MagazineHome, { initialNow: "2026-10-01T02:30:00Z", initialLocale: 'pt', adConfig: null, articles: [], viewer: null, preview }));
    assert.equal((html.match(/Espaço publicitário ilustrativo/g) ?? []).length, count, mode);
    assert.match(html, /<time dateTime="2026-10-01T02:30:00Z">—<\/time>/);
    assert.doesNotMatch(html, /adsbygoogle|data-ad-client|data-ad-slot/);
  }
});

test('Multiplex markup precedes highlights and readable article bodies in all seven languages', async () => {
  const { default: MagazineHome } = await vite.ssrLoadModule('/app/magazine-home.tsx');
  const { ArticleView } = await vite.ssrLoadModule('/app/article-view.tsx');
  const { articles, locales } = await vite.ssrLoadModule('/app/content-public.ts');
  const config = { publisherId: 'ca-pub-1234143346239141', multiplexSlotId: '6564696852', experience: 'standard' };
  const marker = 'data-ad-slot="6564696852"';
  for (const { code: locale } of locales) {
    const home = renderToStaticMarkup(createElement(MagazineHome, { initialNow: "2026-10-01T02:30:00Z", initialLocale: locale, adConfig: config, articles: [], viewer: null }));
    assert.equal(home.split(marker).length - 1, 1, locale);
    assert.ok(home.indexOf('class="magazine-intro"') >= 0, locale);
    assert.ok(home.indexOf(marker) > home.indexOf('class="magazine-intro"'), locale);
    assert.ok(home.indexOf(marker) < home.indexOf('class="section-block latest-block"'), locale);
    const unit = home.match(/<ins[^>]*data-ad-slot="6564696852"[^>]*>/)?.[0];
    assert.match(unit, /data-ad-client="ca-pub-1234143346239141"/);
    assert.match(unit, /data-ad-format="autorelaxed"/);
    assert.doesNotMatch(unit, /data-full-width-responsive/);

    const props = { article: articles[0], locale, content: { body: ['Narrative fixture.'], takeaways: ['One', 'Two', 'Three'] }, access: { allowed: true, remaining: 3, reason: 'free', metered: true }, adConfig: config, viewer: null, comments: [] };
    const readable = renderToStaticMarkup(createElement(ArticleView, props));
    assert.equal(readable.split(marker).length - 1, 1, locale);
    assert.ok(readable.indexOf(marker) < readable.indexOf('class="article-copy"'), locale);
    const denied = renderToStaticMarkup(createElement(ArticleView, { ...props, content: null, access: { ...props.access, allowed: false } }));
    assert.doesNotMatch(denied, /data-ad-slot=/);
    for (const experience of ['none']) {
      const paidConfig = { ...config, experience, multiplexSlotId: null };
      const paidHome = renderToStaticMarkup(createElement(MagazineHome, { initialNow: "2026-10-01T02:30:00Z", initialLocale: locale, adConfig: paidConfig, articles: [], viewer: { accessTier: 'founder', sharedAccess: false } }));
      const paidArticle = renderToStaticMarkup(createElement(ArticleView, { ...props, adConfig: paidConfig, viewer: { accessTier: 'founder', sharedAccess: false } }));
      assert.ok(!paidHome.includes(marker), locale + experience);
      assert.ok(!paidArticle.includes(marker), locale + experience);
    }
  }
});

test('latest highlights show eight distinct published entries in each language', async () => {
  const { default: MagazineHome } = await vite.ssrLoadModule('/app/magazine-home.tsx');
  const { articles, locales } = await vite.ssrLoadModule('/app/content-public.ts');
  const entries = Array.from({ length: 10 }, (_, i) => ({ ...articles[0], slug: `entry-${i}`, isDaily: i % 2 === 0 }));
  for (const { code } of locales) {
    const html = renderToStaticMarkup(createElement(MagazineHome, { initialNow: '2026-10-01T02:30:00Z', initialLocale: code, adConfig: null, articles: entries, viewer: null }));
    const highlights = html.split('class="latest-grid"')[1].split('</section>')[0];
    assert.equal((highlights.match(/<article /g) ?? []).length, 8, code);
    for (let i = 0; i < 8; i++) assert.ok(highlights.includes(`/artigo/entry-${i}?`), code);
    assert.ok(!highlights.includes('/artigo/entry-8?'), code);
  }
});
