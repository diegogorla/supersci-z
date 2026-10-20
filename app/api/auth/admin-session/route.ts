import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { authCookieOptions, parseRequestCookies } from "@/lib/security/auth-cookies";
import { isSameOriginMutation } from "@/lib/security/request";
import { readBoundedJson, RequestBodyError } from "@/lib/security/request-body";
import { allowAuthAttempt } from "@/lib/security/auth-rate-limit";
import { OWNER_PREVIEW_COOKIE } from "@/lib/owner-preview/model";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  if (!isSupabaseConfigured()) return json({ error: "not_configured" }, 503);
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!allowAuthAttempt(`admin-password:${ip}`, 10)) return json({ error: "try_later" }, 429);
  try {
    const parsed = schema.safeParse(await readBoundedJson(request, 4096));
    if (!parsed.success) return json({ error: "invalid_request" }, 400);
    const { url, publishableKey } = getPublicSupabaseConfig();
    // Stage cookies on this response, but deliver it ONLY after authorization.
    // No privileged key, password, token or user record is sent to the client.
    const response = json({ ok: true, next: "/conta" });
    const supabase = createServerClient(url, publishableKey, {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => parseRequestCookies(request.headers.get("cookie") ?? ""),
        setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user || !data.session) return json({ error: "access_denied" }, 401);
    const { data: profile, error: profileError } = await supabase.from("reader_profiles")
      .select("authority").eq("user_id", data.user.id).maybeSingle();
    // Password-only login must not bypass an enrolled second factor.
    const needsSecondFactor = data.user.factors?.some((factor) => factor.status === "verified");
    if (profileError || profile?.authority !== "admin" || needsSecondFactor) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return json({ error: "access_denied" }, 401);
    }
    response.cookies.set(OWNER_PREVIEW_COOKIE, "", { ...authCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return error instanceof RequestBodyError
      ? json({ error: error.message }, error.status)
      : json({ error: "login_unavailable" }, 503);
  }
}
