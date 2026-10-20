import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { ensureReaderCookie, persistReaderCookie } from "@/lib/security/reader-cookie";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { isMembershipInfrastructureReady } from "@/lib/supabase/server-config";

export async function proxy(request: NextRequest) {
  const readerCookie = isMembershipInfrastructureReady() && getPaddleEnvironment() === "live"
    ? await ensureReaderCookie(request)
    : null;
  const response = await updateSession(request);
  if (readerCookie?.created) persistReaderCookie(response, readerCookie.value);
  return response;
}

export const config = {
  matcher: ["/", "/revista", "/tema/:path*", "/conta/:path*", "/entrar/:path*", "/gestao/:path*", "/assine/:path*", "/auth/:path*", "/api/auth/:path*", "/api/account/:path*", "/api/gestao/:path*", "/api/paddle/:path*", "/artigo/:path*"],
};
