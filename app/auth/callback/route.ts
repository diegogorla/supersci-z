import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnPath } from "@/lib/security/return-path";
import { siteOrigin } from "@/lib/security/request";
import { authSuccessPath } from "@/lib/supabase/email-auth";
import { authCookieOptions, parseRequestCookies } from "@/lib/security/auth-cookies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const next = safeReturnPath(url.searchParams.get("next"));
  const provider = url.searchParams.get("provider") === "apple" ? "apple" : "google";
  const canonicalOrigin = siteOrigin();
  const response = NextResponse.redirect(new URL(authSuccessPath(next, provider), canonicalOrigin));

  if (!code || code.length > 2048 || (flowId?.length ?? 0) > 128 || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.redirect(new URL("/entrar?erro=configuracao", canonicalOrigin));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => parseRequestCookies(request.headers.get("cookie") ?? ""),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  return error ? NextResponse.redirect(new URL("/entrar?erro=oauth", canonicalOrigin)) : response;
}
