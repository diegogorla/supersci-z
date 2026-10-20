import assert from "node:assert/strict";
import test from "node:test";

const hostedPublicEnv = {
  NEXT_PUBLIC_SITE_URL: "https://supersci-z.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_safe_test",
  GOOGLE_ANALYTICS_ENABLED: "true",
  GOOGLE_ANALYTICS_MEASUREMENT_ID: "G-TEST12345",
};

test("renders publication metadata and security headers", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      ...hostedPublicEnv,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors https:\/\/chatgpt\.com(?:;|$)/);
  assert.match(response.headers.get("content-security-policy") ?? "", /https:\/\/cdn\.paddle\.com/);
  assert.match(response.headers.get("content-security-policy") ?? "", /https:\/\/pagead2\.googlesyndication\.com/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const html = await response.text();
  const nonce = response.headers.get("content-security-policy").match(/'nonce-([^']+)'/)[1];
  const executableInlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attrs, body]) => body && !/application\/ld\+json/.test(attrs));
  assert.ok(executableInlineScripts.length >= 2);
  for (const [, attrs] of executableInlineScripts) assert.ok(attrs.includes(`nonce="${nonce}"`), "Every executable inline script must be authorized");
  assert.match(html, /<title>SUPER SCI-Z/);
  assert.match(html, /G-TEST12345/);
  assert.doesNotMatch(html, /name=["']codex-preview["']/i);
});

test("keeps Supabase credentials and SDK configuration on the server", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/entrar", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      ...hostedPublicEnv,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /A conexão segura de cadastro está sendo ativada/);
  assert.doesNotMatch(html, /sb_publishable_browser_safe_test/);
  assert.doesNotMatch(html, /project-ref\.supabase\.co/);
});

test("explains invalid email links without exposing provider errors", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-error-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    ...hostedPublicEnv,
  };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const loginResponse = await worker.fetch(
    new Request("http://localhost/entrar?erro=link", { headers: { accept: "text/html" } }),
    env,
    context,
  );
  assert.match(await loginResponse.text(), /O link de acesso expirou/);

  const confirmationResponse = await worker.fetch(
    new Request("http://localhost/auth/confirm?next=//evil.example", { redirect: "manual" }),
    env,
    context,
  );
  assert.equal(confirmationResponse.status, 307);
  assert.equal(confirmationResponse.headers.get("location"), "https://supersci-z.com/entrar?erro=link");
});

test("renders crawlable localized pages, topic hubs and discovery feeds", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("seo-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, NEXT_PUBLIC_SITE_URL: "https://supersci-z.com" };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const legacyMagazine = await worker.fetch(new Request("http://localhost/revista?lang=en", { headers: { accept: "text/html" } }), env, context);
  assert.equal(legacyMagazine.status, 308);
  assert.equal(new URL(legacyMagazine.headers.get("location"), "http://localhost").pathname, "/");
  assert.equal(new URL(legacyMagazine.headers.get("location"), "http://localhost").searchParams.get("lang"), "en");
  const englishMagazine = await worker.fetch(new Request("http://localhost/?lang=en", { headers: { accept: "text/html" } }), env, context);
  const magazineHtml = await englishMagazine.text();
  assert.match(magazineHtml, /Latest Highlights/);
  assert.match(magazineHtml, /Science to Supersize Understanding/);
  assert.match(magazineHtml, /logo-z-orbit\.png/);
  assert.doesNotMatch(magazineHtml, /Knowledge does not fit into drawers/);
  assert.match(magazineHtml, /hrefLang="pt-BR"/);
  assert.match(magazineHtml, /Real science in your language/);

  const portugueseLanding = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, context);
  const landingHtml = await portugueseLanding.text();
  assert.match(landingHtml, /O Superlativo de Ciência/);
  assert.match(landingHtml, /logo-z-orbit\.png/);
  assert.doesNotMatch(landingHtml, /Conhecimento sem fronteiras disciplinares/);

  const topic = await worker.fetch(new Request("http://localhost/tema/cosmologia?lang=en", { headers: { accept: "text/html" } }), env, context);
  const topicHtml = await topic.text();
  assert.equal(topic.status, 200);
  assert.match(topicHtml, /<h1>Cosmology<\/h1>/);
  assert.match(topicHtml, /CollectionPage/);

  const sitemap = await worker.fetch(new Request("http://localhost/sitemap.xml"), env, context);
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /\/tema\/linguistica/);
  assert.match(sitemapXml, /lang=en/);

  const feed = await worker.fetch(new Request("http://localhost/feed.xml"), env, context);
  assert.match(feed.headers.get("content-type") ?? "", /application\/rss\+xml/);
  assert.match(await feed.text(), /<rss version="2.0">/);
});

test("Sites public reader stays on its origin while sensitive flows use the main domain", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, NEXT_PUBLIC_SITE_URL: "https://supersci-z.com" };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const publicPage = await worker.fetch(new Request("https://super-sci-z.dgorla.chatgpt.site/", { headers: { accept: "text/html", "sec-fetch-dest": "iframe" } }), env, context);
  assert.equal(publicPage.status, 200);
  assert.equal(publicPage.headers.get("location"), null);
  assert.match(await publicPage.text(), /https:\/\/supersci-z.com\//);
  const login = await worker.fetch(new Request("https://super-sci-z.dgorla.chatgpt.site/entrar"), env, context);
  assert.equal(login.status, 308);
  assert.equal(login.headers.get("location"), "https://supersci-z.com/entrar");
  assert.equal(login.headers.get("x-frame-options"), "DENY");
});
