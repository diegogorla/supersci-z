import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createHmac } from "node:crypto";

const vite = await createServer({ appType: "custom", configFile: false, server: { middlewareMode: true, hmr: false } });

test.after(async () => vite.close());

test("accepts only same-site return paths", async () => {
  const { safeReturnPath } = await vite.ssrLoadModule("/lib/security/return-path.ts");
  assert.equal(safeReturnPath("/conta"), "/conta");
  assert.equal(safeReturnPath("/artigo/materia-segura?lang=en"), "/artigo/materia-segura?lang=en");
  for (const attack of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%5cevil.example",
    "/%2f%2fevil.example",
    "/conta?next=https://evil.example",
    "/artigo/../conta",
    "/conta#https://evil.example",
  ]) {
    assert.equal(safeReturnPath(attack), "/conta", attack);
  }
});

test("accepts only the editorial dashboard as an administrative return path", async () => {
  const { safeAdminReturnPath } = await vite.ssrLoadModule("/lib/security/admin-return-path.ts");
  assert.equal(safeAdminReturnPath("/gestao/editorial"), "/gestao/editorial");
  assert.equal(safeAdminReturnPath("/gestao/editorial?agente=fred_nilo"), "/gestao/editorial?agente=fred_nilo");
  for (const unsafe of ["/gestao", "/gestao/editorial?agente=intruso", "/gestao/editorial?next=//evil.invalid", "//evil.invalid/gestao/editorial"]) {
    assert.equal(safeAdminReturnPath(unsafe), "/conta", unsafe);
  }
});

test("accepts only known Supabase email confirmation types", async () => {
  const { parseEmailOtpType, loginErrorMessage, authSuccessPath } = await vite.ssrLoadModule("/lib/supabase/email-auth.ts");
  for (const type of ["email", "signup", "invite", "magiclink", "recovery", "email_change"]) {
    assert.equal(parseEmailOtpType(type), type);
  }
  assert.equal(parseEmailOtpType("admin"), null);
  assert.equal(parseEmailOtpType("https://evil.example"), null);
  assert.match(loginErrorMessage("link"), /expirou/);
  assert.equal(authSuccessPath("/conta", "email"), "/conta?acesso=email");
  assert.equal(authSuccessPath("/artigo/teste?lang=en", "google"), "/artigo/teste?lang=en&acesso=google");
});

test("does not advertise inactive social providers or an unavailable email code", async () => {
  const loginPanel = await readFile(
    fileURLToPath(new URL("../app/entrar/login-panel.tsx", import.meta.url)),
    "utf8",
  );
  const loginPage = await readFile(
    fileURLToPath(new URL("../app/entrar/page.tsx", import.meta.url)),
    "utf8",
  );

  assert.doesNotMatch(loginPanel, /Google — em configuração|Apple — em configuração/);
  assert.match(loginPanel, /googleEnabled && <Button/);
  assert.match(loginPanel, /appleEnabled && <Button/);
  assert.match(loginPanel, /emailAuthMode === "otp"/);
  assert.match(loginPage, /SUPABASE_GOOGLE_ENABLED/);
  assert.match(loginPage, /SUPABASE_EMAIL_AUTH_MODE/);
  const callback = await readFile(fileURLToPath(new URL("../app/auth/callback/route.ts", import.meta.url)), "utf8");
  assert.match(callback, /searchParams\.get\("sb_flow_id"\)/);
  assert.match(callback, /exchangeCodeForSession\(code, flowId \? \{ flowId \} : undefined\)/);
});

test("does not ship protected article paragraphs in browser assets", async () => {
  async function readTree(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? readTree(target) : readFile(target, "utf8").catch(() => "");
    }))).join("\n");
  }
  const browserBundle = await readTree(fileURLToPath(new URL("../dist/client", import.meta.url)));
  assert.doesNotMatch(browserBundle, /O Nancy Grace Roman Space Telescope chega/);
  assert.doesNotMatch(browserBundle, /Transformá-la em hipótese física exige/);
  assert.doesNotMatch(browserBundle, /PADDLE_API_KEY/);
  assert.doesNotMatch(browserBundle, /PADDLE_WEBHOOK_SECRET/);
});

test("accepts only fresh authentic Paddle webhook signatures", async () => {
  const { verifyPaddleSignature } = await vite.ssrLoadModule("/lib/paddle/webhook.ts");
  const secret = "pdl_ntfset_test_secret";
  const body = JSON.stringify({ event_id: "evt_test" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex");
  assert.equal(await verifyPaddleSignature(body, `ts=${timestamp};h1=${signature}`, secret), true);
  assert.equal(await verifyPaddleSignature(`${body} `, `ts=${timestamp};h1=${signature}`, secret), false);
  assert.equal(await verifyPaddleSignature(body, `ts=${timestamp - 120};h1=${signature}`, secret), false);
});

test("passes only Paddle customer IDs to Retain in live checkout", async () => {
  const checkoutClient = await readFile(
    fileURLToPath(new URL("../app/assine/checkout-button.tsx", import.meta.url)),
    "utf8",
  );
  const checkoutRoute = await readFile(
    fileURLToPath(new URL("../app/api/paddle/checkout/route.ts", import.meta.url)),
    "utf8",
  );

  assert.match(checkoutClient, /pwCustomer: checkout\.paddleCustomerId \? \{ id: checkout\.paddleCustomerId \} : \{\}/);
  assert.doesNotMatch(checkoutClient, /pwCustomer:\s*\{\s*(?:id:\s*)?checkout\.customerEmail/);
  assert.match(checkoutRoute, /\^ctm_\[a-z0-9\]\{26\}\$/);
});

test("rejects Paddle client tokens from the wrong environment", async () => {
  const { isPaddleClientTokenForEnvironment } = await vite.ssrLoadModule("/lib/paddle/environment.ts");
  const sandboxToken = `test_${"a".repeat(27)}`;
  const liveToken = `live_${"a".repeat(27)}`;

  assert.equal(isPaddleClientTokenForEnvironment(sandboxToken, "sandbox"), true);
  assert.equal(isPaddleClientTokenForEnvironment(sandboxToken, "live"), false);
  assert.equal(isPaddleClientTokenForEnvironment(liveToken, "live"), true);
  assert.equal(isPaddleClientTokenForEnvironment(liveToken, "sandbox"), false);
  assert.equal(isPaddleClientTokenForEnvironment("live_too_short", "live"), false);
});

test("keeps controlled Paddle checkouts restricted to configured authenticated testers", async () => {
  const route = await readFile(
    fileURLToPath(new URL("../app/api/paddle/checkout/route.ts", import.meta.url)),
    "utf8",
  );
  const sandboxGate = await readFile(
    fileURLToPath(new URL("../lib/paddle/sandbox-test.ts", import.meta.url)),
    "utf8",
  );
  const liveGate = await readFile(
    fileURLToPath(new URL("../lib/paddle/live-test.ts", import.meta.url)),
    "utf8",
  );
  const controlledGate = await readFile(
    fileURLToPath(new URL("../lib/paddle/test-access.ts", import.meta.url)),
    "utf8",
  );

  assert.match(route, /isPaddleControlledTestRuntimeReady\(user\.email\)/);
  assert.match(sandboxGate, /PADDLE_SANDBOX_TESTER_EMAIL/);
  assert.match(sandboxGate, /getPaddleEnvironment\(\) === "sandbox"/);
  assert.match(sandboxGate, /isSupabaseConfigured\(\)/);
  assert.match(liveGate, /PADDLE_LIVE_TESTER_EMAIL/);
  assert.match(liveGate, /PADDLE_LIVE_TESTER_EMAILS/);
  assert.match(liveGate, /value\.split\(","\)/);
  assert.match(liveGate, /isPaddleLiveRuntimeReady\(\)/);
  assert.match(controlledGate, /isPaddleSandboxTestRuntimeReady\(email\) \|\| isPaddleLiveTestRuntimeReady\(email\)/);
  assert.doesNotMatch(sandboxGate, /NEXT_PUBLIC_/);
  assert.doesNotMatch(liveGate, /NEXT_PUBLIC_/);
  assert.match(route, /admin\.rpc\("create_checkout_intent_for_user"/);
  assert.match(route, /p_user_id: user\.id/);
  assert.ok(route.indexOf("supabase.auth.getUser()") < route.indexOf("const admin = createAdminSupabaseClient()"));
  const subscribePage = await readFile(
    fileURLToPath(new URL("../app/assine/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(subscribePage, /liveRequested = query\.live === "1"/);
  assert.match(subscribePage, /liveRequested && signedIn && isPaddleLiveTestRuntimeReady/);
  assert.match(subscribePage, /este checkout processa uma cobrança real/);
  assert.doesNotMatch(subscribePage, /Modo de teste Sandbox|4242 4242 4242 4242|sandboxRequested/);
});

test("allows only an authenticated controlled tester to exercise billing actions before paywall cutover", async () => {
  const routeFiles = [
    "../app/api/paddle/portal/route.ts",
    "../app/api/account/cancel/route.ts",
    "../app/api/account/delete/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const route = await readFile(fileURLToPath(new URL(routeFile, import.meta.url)), "utf8");
    assert.match(route, /isSameOriginMutation/);
    assert.match(route, /supabase\.auth\.getUser\(\)/);
    assert.match(route, /isPaddleControlledTestRuntimeReady\(user\.email\)/);
    assert.match(route, /!isMembershipRuntimeReady\(\) && !isPaddleControlledTestRuntimeReady/);
  }

  const accountPage = await readFile(
    fileURLToPath(new URL("../app/conta/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(accountPage, /billingActionsEnabled=\{!effective\.sharedAccess && \(isMembershipRuntimeReady\(\) \|\| isPaddleControlledTestRuntimeReady\(email\)\)\}/);
});

test("qualifies checkout expiration columns and keeps payment errors actionable", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608300001_fix_checkout_intent_expiration.sql", import.meta.url)),
    "utf8",
  );
  const checkoutClient = await readFile(
    fileURLToPath(new URL("../app/assine/checkout-button.tsx", import.meta.url)),
    "utf8",
  );

  assert.match(migration, /update public\.checkout_intents as ci/);
  assert.match(migration, /ci\.expires_at <= now\(\)/);
  assert.doesNotMatch(migration, /and expires_at <= now\(\)/);
  assert.match(checkoutClient, /checkoutErrorMessage/);
  assert.match(checkoutClient, /Nenhuma cobrança foi feita/);
});

test("reports only bounded Paddle client error codes and permits required sandbox assets", async () => {
  const diagnosticRoute = await readFile(
    fileURLToPath(new URL("../app/api/paddle/client-error/route.ts", import.meta.url)),
    "utf8",
  );
  const { contentSecurityPolicy, newScriptNonce } = await vite.ssrLoadModule("/lib/security/headers.ts");
  const worker = contentSecurityPolicy(newScriptNonce());
  const checkoutRoute = await readFile(
    fileURLToPath(new URL("../app/api/paddle/checkout/route.ts", import.meta.url)),
    "utf8",
  );

  assert.match(diagnosticRoute, /isSameOriginMutation/);
  assert.match(diagnosticRoute, /supabase\.auth\.getUser/);
  assert.match(diagnosticRoute, /\^\[a-z0-9_-\]\{1,64\}\$/i);
  assert.doesNotMatch(diagnosticRoute, /user\.email|clientToken|priceId/);
  assert.match(worker, /style-src[^\n]+https:\/\/\*\.paddle\.com/);
  assert.match(worker, /connect-src[^\n]+wss:\/\/\*\.paddle\.com/);
  assert.match(checkoutRoute, /founder_annual_pix[^\n]+\["pix"\][^\n]+null/);
});

test("processes Paddle webhooks without exposing a Supabase master key to Sites", async () => {
  const route = await readFile(
    fileURLToPath(new URL("../app/api/paddle/webhook/route.ts", import.meta.url)),
    "utf8",
  );
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608290001_paddle_webhook_least_privilege.sql", import.meta.url)),
    "utf8",
  );
  const isolationMigration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608290002_isolate_paddle_webhook_definer.sql", import.meta.url)),
    "utf8",
  );

  assert.doesNotMatch(route, /createAdminSupabaseClient/);
  assert.match(route, /process_paddle_event_from_webhook/);
  assert.match(route, /p_webhook_secret:\s*secret/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /grant execute on function public\.process_paddle_event_from_webhook[^;]+to anon/);
  assert.doesNotMatch(migration, /grant execute on function private\.process_paddle_event[^;]+to anon/);
  assert.match(isolationMigration, /create schema if not exists webhook_private/);
  assert.match(isolationMigration, /create or replace function public\.process_paddle_event_from_webhook[\s\S]+security invoker/);
  assert.match(isolationMigration, /grant execute on function webhook_private\.process_paddle_event_from_webhook[^;]+to anon/);
});

test("keeps recurring transaction completion separate from subscription status", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608310001_handle_recurring_transaction_completed.sql", import.meta.url)),
    "utf8",
  );

  assert.match(migration, /p_event_type = 'transaction\.completed' and v_plan_code <> 'lifetime'/);
  assert.match(migration, /return query select 'transaction_confirmed', v_user_id/);
  assert.match(migration, /p_subscription_status is null/);
  assert.match(migration, /select \* from public\.process_paddle_event\(/);
});

test("isolates Paddle Sandbox and Live credentials, records, and account actions", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608310002_isolate_paddle_environments.sql", import.meta.url)),
    "utf8",
  );
  const checkoutRoute = await readFile(
    fileURLToPath(new URL("../app/api/paddle/checkout/route.ts", import.meta.url)),
    "utf8",
  );
  const webhookRoute = await readFile(
    fileURLToPath(new URL("../app/api/paddle/webhook/route.ts", import.meta.url)),
    "utf8",
  );
  const accountPage = await readFile(
    fileURLToPath(new URL("../app/conta/page.tsx", import.meta.url)),
    "utf8",
  );
  const paddleConfig = await readFile(fileURLToPath(new URL("../lib/paddle/config.ts", import.meta.url)), "utf8");

  assert.match(migration, /provider_environment text not null default 'sandbox'/);
  assert.match(migration, /'paddle_' \|\| p_provider_environment \|\| '_webhook_secret'/);
  assert.match(migration, /provider_environment = p_provider_environment/);
  assert.match(migration, /set_config\('app\.paddle_environment', p_provider_environment, true\)/);
  assert.match(checkoutRoute, /p_provider_environment: checkout\.environment/);
  assert.match(checkoutRoute, /\.eq\("provider_environment", checkout\.environment\)/);
  assert.match(webhookRoute, /p_provider_environment: getPaddleEnvironment\(\)/);
  assert.match(accountPage, /\.eq\("provider_environment", environment\)/);
  assert.match(paddleConfig, /PADDLE_\$\{environment\.toUpperCase\(\)\}_\$\{suffix\}/);
  assert.match(paddleConfig, /environment === "sandbox" \? process\.env\[`PADDLE_\$\{suffix\}`\]/);
  assert.match(paddleConfig, /Live never falls back/);
});

test("keeps identity display separate from entitlement authorization", async () => {
  const { activeAccessTier, readerDisplayName } = await vite.ssrLoadModule("/lib/account/display.ts");
  const accountPage = await readFile(fileURLToPath(new URL("../app/conta/page.tsx", import.meta.url)), "utf8");
  const magazine = await readFile(fileURLToPath(new URL("../app/magazine-home.tsx", import.meta.url)), "utf8");
  const accountServer = await readFile(fileURLToPath(new URL("../lib/account/server.ts", import.meta.url)), "utf8");
  const accountLink = await readFile(fileURLToPath(new URL("../app/account-link.tsx", import.meta.url)), "utf8");

  assert.equal(readerDisplayName({ full_name: "Ada Lovelace" }, "ada@example.com"), "Ada Lovelace");
  assert.equal(activeAccessTier({ access_tier: "cosmos", provider_environment: "sandbox", revoked_at: null, valid_until: "2099-01-01T00:00:00Z" }, "sandbox"), "cosmos");
  assert.equal(activeAccessTier({ access_tier: "cosmos", provider_environment: "sandbox", revoked_at: null, valid_until: "2099-01-01T00:00:00Z" }, "live"), "free");
  assert.equal(activeAccessTier({ access_tier: "lifetime", provider_environment: "live", revoked_at: "2026-01-01T00:00:00Z", valid_until: null }, "live"), "free");
  assert.match(accountServer, /supabase\.auth\.getUser\(\)/);
  assert.match(accountServer, /get_my_effective_access/);
  assert.match(accountPage, /effective\.accessTier/);
  assert.match(magazine, /<AccountLink viewer=\{viewer\}/);
  assert.match(accountLink, /ACCESS_TIER_LABELS\[viewer\.accessTier\]/);
  assert.doesNotMatch(magazine, /user_metadata.*access_tier/);
});

test("allows authenticated readers to record communication consent before paywall activation", async () => {
  const route = await readFile(fileURLToPath(new URL("../app/api/account/preferences/route.ts", import.meta.url)), "utf8");
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /supabase\.auth\.getClaims\(\)/);
  assert.match(route, /\.upsert\(\{ user_id: userId/);
  assert.doesNotMatch(route, /isMembershipRuntimeReady/);
});

test("prepares a public-content cutover without applying it implicitly", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608310005_prepare_membership_cutover.sql", import.meta.url)),
    "utf8",
  );

  assert.match(migration, /open_content_access = false/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on function public\.get_open_article_content\(text, text\)/);
  assert.match(migration, /where provider_environment = 'sandbox'/);
  assert.match(migration, /active_sandbox_entitlement_at_live_cutover/);
  assert.match(migration, /create or replace function public\.get_server_open_article_content/);
  assert.match(migration, /grant execute on function public\.get_server_open_article_content\(text, text\)[\s\S]+to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_open_article_content/);
});

test("creates the signed reader identity before the Live meter is enabled", async () => {
  const proxy = await readFile(fileURLToPath(new URL("../proxy.ts", import.meta.url)), "utf8");
  const cookiesPage = await readFile(fileURLToPath(new URL("../app/cookies/page.tsx", import.meta.url)), "utf8");
  assert.match(proxy, /isMembershipInfrastructureReady\(\) && getPaddleEnvironment\(\) === "live"/);
  assert.match(proxy, /ensureReaderCookie/);
  assert.match(cookiesPage, /a contagem da cota começa somente quando a restrição de leitura for ativada/);
});

test("supports AdSense ownership verification without enabling advertisements", async () => {
  const rootLayout = await readFile(
    fileURLToPath(new URL("../app/layout.tsx", import.meta.url)),
    "utf8",
  );
  const adsense = await readFile(
    fileURLToPath(new URL("../lib/adsense/config.ts", import.meta.url)),
    "utf8",
  );
  const adServer = await readFile(
    fileURLToPath(new URL("../lib/adsense/server.ts", import.meta.url)),
    "utf8",
  );

  assert.match(rootLayout, /google-adsense-account/);
  assert.match(rootLayout, /ca-pub-1234143346239141/);
  assert.match(adsense, /ADSENSE_ENABLED === "true"/);
  assert.match(adsense, /GOOGLE_CMP_ENABLED === "true"/);
  assert.match(adsense, /getAdsenseMultiplexSlotId\(\)/);
  assert.match(adServer, /context\.effective\.accessTier/);
  assert.match(adServer, /if \(!context \|\| context\.user\.id !== claims\.claims\.sub\) return null/);
  assert.match(adServer, /if \(experience === "none"\) return null/);
});

test("resolves paid access by environment and keeps plan benefits behind server routes", async () => {
  const migration = await readFile(fileURLToPath(new URL("../supabase/migrations/20260901183616_plan_benefits_and_live_access.sql", import.meta.url)), "utf8");
  const deviceMigration = await readFile(fileURLToPath(new URL("../supabase/migrations/20260905063407_atomic_cosmos_devices_and_shared_founder.sql", import.meta.url)), "utf8");
  const protectedContent = await readFile(fileURLToPath(new URL("../lib/content/protected.ts", import.meta.url)), "utf8");
  const household = await readFile(fileURLToPath(new URL("../app/api/account/household/route.ts", import.meta.url)), "utf8");
  const householdAccept = await readFile(fileURLToPath(new URL("../app/api/account/household/accept/route.ts", import.meta.url)), "utf8");
  const comments = await readFile(fileURLToPath(new URL("../app/api/account/comments/route.ts", import.meta.url)), "utf8");
  const questions = await readFile(fileURLToPath(new URL("../app/api/account/questions/route.ts", import.meta.url)), "utf8");
  const moderation = await readFile(fileURLToPath(new URL("../app/api/account/moderation/route.ts", import.meta.url)), "utf8");

  assert.match(migration, /e\.provider_environment = p_provider_environment/);
  assert.match(migration, /h\.status = 'active'/);
  assert.match(migration, /e\.access_tier = 'cosmos'/);
  assert.match(migration, /create or replace function private\.register_access_device/);
  assert.match(deviceMigration, /'founder'::text,[\s\S]+true,[\s\S]+1,[\s\S]+0,[\s\S]+'cosmos_share'::text/);
  assert.match(deviceMigration, /pg_advisory_xact_lock\(hashtextextended\('ssz_access_group:'/);
  assert.match(deviceMigration, /order by d\.last_seen_at asc, d\.created_at asc, d\.id asc/);
  assert.match(deviceMigration, /v_personal_limit := greatest\(1, v_access\.device_limit - v_member_count\)/);
  assert.match(deviceMigration, /create or replace function private\.create_cosmos_invite/);
  assert.match(deviceMigration, /create or replace function private\.accept_cosmos_invite/);
  assert.match(deviceMigration, /from private\.reconcile_cosmos_devices\(v_owner_user_id, p_provider_environment\)/);
  assert.match(deviceMigration, /a\.published_at <= now\(\)/);
  for (const rpc of ["create_cosmos_invite", "accept_cosmos_invite", "revoke_cosmos_member"]) {
    assert.match(deviceMigration, new RegExp(`grant execute on function public\\.${rpc}[^;]+to service_role`));
    assert.doesNotMatch(deviceMigration, new RegExp(`grant execute on function public\\.${rpc}[^;]+to (?:anon|authenticated)`));
  }
  assert.match(migration, /grant execute on function public\.consume_article_access_v2[^;]+to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.consume_article_access_v2[^;]+to (?:anon|authenticated)/);
  assert.match(protectedContent, /consume_article_access_v2/);
  assert.match(protectedContent, /get_server_open_article_content/);
  assert.match(protectedContent, /p_provider_environment: getPaddleEnvironment\(\)/);
  assert.match(protectedContent, /p_device_hash: deviceHash/);
  for (const route of [household, comments, questions, moderation]) {
    assert.match(route, /isSameOriginMutation/);
    assert.match(route, /createAdminSupabaseClient/);
  }
  assert.match(household, /hashAccountEmail/);
  assert.match(household, /admin\.rpc\("create_cosmos_invite"/);
  assert.match(household, /admin\.rpc\("revoke_cosmos_member"/);
  assert.match(householdAccept, /admin\.rpc\("accept_cosmos_invite"/);
  assert.doesNotMatch(householdAccept, /\.from\("household_members"\)/);
  assert.match(comments, /email_confirmed_at/);
  assert.match(questions, /priority: context\.effective\.accessTier === "cosmos"/);
  assert.match(moderation, /context\.authority !== "editor" && context\.authority !== "admin"/);
  assert.match(moderation, /z\.discriminatedUnion\("type"/);
});

test("limits advertising to free access and keeps every subscriber ad-free", async () => {
  const { adExperienceForAccess } = await vite.ssrLoadModule("/lib/adsense/experience.ts");
  const magazine = await readFile(fileURLToPath(new URL("../app/magazine-home.tsx", import.meta.url)), "utf8");
  const article = await readFile(fileURLToPath(new URL("../app/article-view.tsx", import.meta.url)), "utf8");
  const account = await readFile(fileURLToPath(new URL("../app/conta/account-panel.tsx", import.meta.url)), "utf8");
  const invite = await readFile(fileURLToPath(new URL("../app/conta/convite/page.tsx", import.meta.url)), "utf8");
  const subscribe = await readFile(fileURLToPath(new URL("../app/assine/page.tsx", import.meta.url)), "utf8");

  assert.equal(adExperienceForAccess("free", true), "standard");
  assert.equal(adExperienceForAccess("founder", true), "none");
  assert.equal(adExperienceForAccess("lifetime", true), "none");
  assert.equal(adExperienceForAccess("cosmos", false), "none");
  assert.equal(adExperienceForAccess("founder", false), "none");
  assert.match(magazine, /adConfig\?\.experience === "standard"/);
  assert.match(article, /adConfig\?\.experience === "standard"/);
  assert.doesNotMatch(account, /Metade das inserções do acesso gratuito/);
  assert.match(account, /Fundador compartilhado/);
  assert.match(account, /experiência sem anúncios/);
  assert.doesNotMatch(account, /publicidade reduzida/);
  assert.match(invite, /perfil equivalente ao Fundador/);
  assert.match(invite, /experiência sem anúncios/);
  assert.match(subscribe, /Até dois perfis convidados com benefícios Fundador e sem anúncios/);
});

test("separates analytics consent from the certified Google advertising CMP", async () => {
  const consent = await readFile(fileURLToPath(new URL("../app/cookie-consent.tsx", import.meta.url)), "utf8");
  const analytics = await readFile(fileURLToPath(new URL("../app/google-analytics.tsx", import.meta.url)), "utf8");
  assert.match(consent, /CONSENT_API_READY/);
  assert.match(consent, /showRevocationMessage/);
  assert.match(consent, /Somente essenciais/);
  assert.match(consent, /Aceitar Analytics/);
  assert.match(consent, /Gerenciar opções/);
  assert.doesNotMatch(consent, /advertising: analyticsAllowed/);
  assert.match(analytics, /analytics_storage: "denied"/);
  assert.match(analytics, /ad_user_data: "denied"/);
  assert.match(analytics, /choice\?\.analytics === true/);
  assert.match(analytics, /www\.googletagmanager\.com/);
});

test("does not claim payment confirmation before the signed webhook is recorded", async () => {
  const successPage = await readFile(fileURLToPath(new URL("../app/assine/sucesso/page.tsx", import.meta.url)), "utf8");
  assert.match(successPage, /CONFIRMAÇÃO EM PROCESSAMENTO/);
  assert.match(successPage, /evento assinado do Paddle/);
  assert.match(successPage, /\.in\("status", \["trialing", "active"\]\)/);
  assert.doesNotMatch(successPage, /<span className="editorial-label">PAGAMENTO RECEBIDO<\/span>/);
});

test("propagates every server-only commercial and authentication setting to the worker", async () => {
  const worker = await readFile(fileURLToPath(new URL("../worker/index.ts", import.meta.url)), "utf8");
  for (const key of [
    "ADSENSE_ARTICLE_SLOT_ID",
    "ADSENSE_ENABLED",
    "ADSENSE_FEED_SLOT_ID",
    "GOOGLE_ANALYTICS_ENABLED",
    "GOOGLE_ANALYTICS_MEASUREMENT_ID",
    "ACCOUNT_DATA_HMAC_SECRET",
    "PADDLE_LIVE_API_KEY",
    "PADDLE_LIVE_CLIENT_TOKEN",
    "PADDLE_LIVE_WEBHOOK_SECRET",
    "PADDLE_LIVE_TESTER_EMAIL",
    "PADDLE_LIVE_TESTER_EMAILS",
    "PADDLE_SANDBOX_TESTER_EMAIL",
    "SUPABASE_APPLE_ENABLED",
    "SUPABASE_EMAIL_AUTH_MODE",
    "SUPABASE_GOOGLE_ENABLED",
  ]) {
    assert.match(worker, new RegExp(`"${key}"`), key);
  }
});

test("provides reliable webmail contact actions and branded browser icons", async () => {
  const contactActions = await readFile(
    fileURLToPath(new URL("../app/contato/contact-email-actions.tsx", import.meta.url)),
    "utf8",
  );
  const subscribePage = await readFile(
    fileURLToPath(new URL("../app/assine/page.tsx", import.meta.url)),
    "utf8",
  );
  const favicon = await readFile(
    fileURLToPath(new URL("../public/favicon.svg", import.meta.url)),
    "utf8",
  );

  assert.match(contactActions, /navigator\.clipboard/);
  assert.match(contactActions, /mail\.google\.com\/mail/);
  assert.match(contactActions, /outlook\.office\.com\/mail\/deeplink\/compose/);
  assert.match(subscribePage, /href="\/contato\?assunto=assinatura"/);
  const embeddedPng = favicon.match(/href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
  assert.ok(embeddedPng, "favicon uses the supplied orbital logo");
  const icon = Buffer.from(embeddedPng[1], "base64");
  assert.equal(icon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(icon.readUInt32BE(16), 64);
  assert.equal(icon.readUInt32BE(20), 64);
  assert.equal(icon[25], 6, "icon supports full alpha transparency");
  assert.doesNotMatch(favicon, /<rect\b/);
});

test("keeps two idempotent daily editorial slots behind server-only validation", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608280004_support_two_daily_articles.sql", import.meta.url)),
    "utf8",
  );

  assert.match(migration, /unique \(run_date, run_slot\)/);
  assert.match(migration, /publicationSlot/);
  assert.match(migration, /v_run_slot not between 1 and 2/);
  assert.match(migration, /select er\.id,er\.status,er\.article_slug/);
  assert.match(migration, /from jsonb_object_keys\(v_translations\)/);
  assert.doesNotMatch(migration, /jsonb_object_length/);
  assert.match(migration, /grant execute on function private\.publish_validated_daily_article\(jsonb\) to service_role/);
  assert.doesNotMatch(migration, /grant execute[^;]+to (?:anon|authenticated)/);
});

test("revises a published article main source only from its recorded scientific sources", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/20260906153225_extend_article_revision_source_metadata.sql", import.meta.url)),
    "utf8",
  );

  assert.match(migration, /sourceName and sourceUrl must be supplied together/);
  assert.match(migration, /v_source_url !~ '\^https:\/\/'/);
  assert.match(migration, /from public\.article_sources as s/);
  assert.match(migration, /s\.source_type in \('primary', 'institutional', 'review'\)/);
  assert.match(migration, /insert into private\.article_revision_log/);
  assert.match(migration, /revoke all on function private\.revise_published_article\(jsonb\) from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function private\.revise_published_article\(jsonb\) to postgres/);
  assert.doesNotMatch(migration, /grant execute[^;]+to (?:anon|authenticated|service_role)/);
});

test("publishes extra features without consuming daily slots or bypassing editorial validation", async () => {
  const migration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608310003_validated_feature_articles.sql", import.meta.url)),
    "utf8",
  );
  const indexMigration = await readFile(
    fileURLToPath(new URL("../supabase/migrations/202608310004_index_feature_run_article_slug.sql", import.meta.url)),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.editorial_feature_runs/);
  assert.match(migration, /alter table public\.editorial_feature_runs enable row level security/);
  assert.match(migration, /contentType/);
  assert.match(migration, /three_distinct_sources_required/);
  assert.match(migration, /primary_or_institutional_source_required/);
  assert.match(migration, /review_source_required/);
  assert.match(migration, /current_context_source_required/);
  assert.match(migration, /jsonb_array_length\(v_copy->'body'\) < 5/);
  assert.match(migration, /p_payload->>'sourceUrl'/);
  assert.match(migration, /p_payload->>'sourceName'/);
  assert.match(migration, /p_payload->>'sourceUrl', false,/);
  assert.match(migration, /grant execute on function private\.publish_validated_feature_article\(jsonb\) to service_role/);
  assert.doesNotMatch(migration, /grant execute[^;]+to (?:anon|authenticated)/);
  assert.match(indexMigration, /editorial_feature_runs_article_slug_idx/);
});

test("only public reading routes allow the exact ChatGPT viewer origin", async () => {
  const { withSecurityHeaders, newScriptNonce } = await vite.ssrLoadModule("/lib/security/headers.ts");
  for (const path of ["/", "/revista?lang=en", "/artigo/teste", "/tema/fisica", "/sobre"]) {
    const response = withSecurityHeaders(new Response("public", { headers: { "X-Frame-Options": "DENY" } }), new Request(`https://supersci-z.com${path}`), newScriptNonce());
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors https:\/\/chatgpt\.com;/);
    assert.equal(response.headers.get("x-frame-options"), null);
  }
  for (const path of ["/entrar", "/entrar/administracao", "/conta", "/gestao/editorial", "/auth/callback", "/api/paddle/checkout", "/assine", "/assine/sucesso", "/future-admin", "/artigo/teste/edit"]) {
    const response = withSecurityHeaders(new Response("private"), new Request(`https://supersci-z.com${path}`), newScriptNonce());
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none';/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  }
});
