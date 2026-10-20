import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation, siteOrigin } from "@/lib/security/request";
import { safeReturnPath } from "@/lib/security/return-path";
import { readBoundedJson, RequestBodyError } from "@/lib/security/request-body";
import { allowAuthAttempt } from "@/lib/security/auth-rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublicSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("oauth"), provider: z.enum(["google", "apple"]), next: z.string().max(512).optional() }).strict(),
  z.object({ action: z.literal("email"), email: z.string().trim().email().max(254), next: z.string().max(512).optional() }).strict(),
  z.object({ action: z.literal("verify"), email: z.string().trim().email().max(254), token: z.string().regex(/^\d{6}$/), next: z.string().max(512).optional() }).strict(),
  z.object({ action: z.literal("logout") }).strict(),
]);
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }); }

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  if (!isSupabaseConfigured()) return json({ error: "not_configured" }, 503);
  try {
    const parsed = schema.safeParse(await readBoundedJson(request, 2048));
    if (!parsed.success) return json({ error: "invalid_request" }, 400);
    const input = parsed.data;
    if (input.action !== "logout") {
      const ip = request.headers.get("cf-connecting-ip") ?? "local";
      if (!allowAuthAttempt(`${input.action}:${ip}`, input.action === "verify" ? 15 : 10)) return json({ error: "try_later" }, 429);
    }
    const supabase = await createServerSupabaseClient();
    if (input.action === "logout") {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      return error ? json({ error: "logout_failed" }, 503) : json({ ok: true });
    }
    const next = safeReturnPath(input.next);
    if (input.action === "oauth") {
      const enabled = input.provider === "google" ? process.env.SUPABASE_GOOGLE_ENABLED === "true" : process.env.SUPABASE_APPLE_ENABLED === "true";
      if (!enabled) return json({ error: "provider_disabled" }, 403);
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: input.provider, options: {
        skipBrowserRedirect: true,
        redirectTo: `${siteOrigin()}/auth/callback?provider=${input.provider}&next=${encodeURIComponent(next)}`,
        queryParams: input.provider === "google" ? { prompt: "select_account" } : undefined,
      } });
      if (error || !data.url) return json({ error: "login_unavailable" }, 503);
      const target = new URL(data.url);
      if (target.origin !== new URL(getPublicSupabaseConfig().url).origin || target.pathname !== "/auth/v1/authorize") return json({ error: "invalid_provider_url" }, 503);
      return json({ ok: true, url: target.toString() });
    }
    if (input.action === "email") {
      const { error } = await supabase.auth.signInWithOtp({ email: input.email, options: { shouldCreateUser: true, emailRedirectTo: `${siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}` } });
      // No provider errors or account-existence details are returned to visitors.
      return error ? json({ error: "login_unavailable" }, 503) : json({ ok: true });
    }
    if (process.env.SUPABASE_EMAIL_AUTH_MODE !== "otp") return json({ error: "code_disabled" }, 403);
    const { error } = await supabase.auth.verifyOtp({ email: input.email, token: input.token, type: "email" });
    return error ? json({ error: "invalid_code" }, 400) : json({ ok: true, next });
  } catch (error) {
    return error instanceof RequestBodyError ? json({ error: error.message }, error.status) : json({ error: "login_unavailable" }, 503);
  }
}
