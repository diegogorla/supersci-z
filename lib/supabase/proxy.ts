import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, getPublicSupabaseConfig } from "./config";
import { authCookieOptions } from "@/lib/security/auth-cookies";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Auth handlers own refresh/sign-in/sign-out cookies. Middleware cookies must
  // never overwrite the handler's expired cookie during logout or account changes.
  const path = request.nextUrl.pathname;
  if (path === "/api/auth/session" || path === "/api/auth/admin-session" || path.startsWith("/auth/")) return response;
  if (!isSupabaseConfigured()) return response;

  const { url, publishableKey } = getPublicSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const claims = await supabase.auth.getClaims();
  // Existing sessions receive HttpOnly protection on their next verified request.
  if (claims.data?.claims?.sub && !claims.error) {
    const prefix = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
    for (const { name, value } of request.cookies.getAll()) {
      if (name === prefix || (name.startsWith(`${prefix}.`) && /^\d+$/.test(name.slice(prefix.length + 1)))) {
        response.cookies.set(name, value, { ...authCookieOptions, maxAge: 400 * 24 * 60 * 60 });
      }
    }
  }
  return response;
}
