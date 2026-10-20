import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnPath } from "@/lib/security/return-path";
import { siteOrigin } from "@/lib/security/request";
import { authSuccessPath, parseEmailOtpType } from "@/lib/supabase/email-auth";
import { authCookieOptions, parseRequestCookies } from "@/lib/security/auth-cookies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = parseEmailOtpType(url.searchParams.get("type"));
  const next = safeReturnPath(url.searchParams.get("next"));
  const canonicalOrigin = siteOrigin();
  const response = NextResponse.redirect(new URL(authSuccessPath(next, "email"), canonicalOrigin));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.redirect(new URL("/entrar?erro=configuracao", canonicalOrigin));
  }

  if ((!code && !(tokenHash && type)) || (code?.length ?? 0) > 2048 || (tokenHash?.length ?? 0) > 2048) {
    return NextResponse.redirect(new URL("/entrar?erro=link", canonicalOrigin));
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

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });

  return error ? NextResponse.redirect(new URL("/entrar?erro=link", canonicalOrigin)) : response;
}
