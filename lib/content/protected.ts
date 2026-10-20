import { getOwnerPreview } from "@/lib/owner-preview/server";
import "server-only";
import { cookies, headers } from "next/headers";
import type { Locale, PublicArticle } from "@/app/content-public";
import { hashReaderDevice, READER_COOKIE, verifyReaderCookie } from "@/lib/security/reader-cookie";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOpenArticleContent } from "@/lib/content/public";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { deviceLabel } from "@/lib/security/device-label";

export type ProtectedArticleAccess = {
  allowed: boolean;
  remaining: number;
  reason: string;
  body: string[] | null;
  takeaways: string[] | null;
  metered: boolean;
};

export async function getProtectedArticleAccess(article: PublicArticle, locale: Locale): Promise<ProtectedArticleAccess> {
  // Authorization is fresh and server-side; this branch never consumes a reading
  // credit or registers a device, and never accepts a tier supplied by the client.
  const preview = await getOwnerPreview();
  if (preview) {
    if (preview.mode === "visitor" && preview.exhausted) {
      return { allowed: false, remaining: 0, reason: "quota_exhausted", body: null, takeaways: null, metered: true };
    }
    const copy = await getEmergencyOpenArticleContent(article.slug, locale);
    return copy
      ? { allowed: true, remaining: preview.mode === "visitor" ? 3 : 999999, reason: "owner_preview", body: copy.body, takeaways: copy.takeaways, metered: true }
      : { allowed: false, remaining: 0, reason: "service_unavailable", body: null, takeaways: null, metered: false };
  }
  if (!isMembershipRuntimeReady()) {
    // Before cutover, the public RPC serves the inaugural open edition. After
    // cutover, an emergency rollback uses a service-role-only RPC so disabling
    // the meter never exposes full article bodies directly to browsers.
    const copy = await getEmergencyOpenArticleContent(article.slug, locale);
    return copy
      ? { allowed: true, remaining: 999999, reason: "open_inaugural", body: copy.body, takeaways: copy.takeaways, metered: false }
      : { allowed: false, remaining: 0, reason: "service_unavailable", body: null, takeaways: null, metered: false };
  }

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  const cookieStore = await cookies();
  const verifiedReaderId = await verifyReaderCookie(cookieStore.get(READER_COOKIE)?.value);
  const readerId = userId ? null : verifiedReaderId;
  if (!userId && !readerId) {
    return { allowed: false, remaining: 0, reason: "reader_cookie_required", body: null, takeaways: null, metered: true };
  }
  const deviceHash = userId ? await hashReaderDevice(verifiedReaderId) : null;
  if (userId && !deviceHash) {
    return { allowed: false, remaining: 0, reason: "device_cookie_required", body: null, takeaways: null, metered: true };
  }

  try {
    const admin = createAdminSupabaseClient();
    const requestHeaders = await headers();
    const { data, error } = await admin.rpc("consume_article_access_v2", {
      p_article_slug: article.slug,
      p_locale: locale,
      p_user_id: userId,
      p_reader_id: readerId,
      p_provider_environment: getPaddleEnvironment(),
      p_device_hash: deviceHash,
      p_device_label: deviceLabel(requestHeaders.get("user-agent")),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      remaining: typeof row?.remaining === "number" ? row.remaining : 0,
      reason: typeof row?.reason === "string" ? row.reason : "access_denied",
      body: Array.isArray(row?.body) ? row.body.filter((item: unknown): item is string => typeof item === "string") : null,
      takeaways: Array.isArray(row?.takeaways) ? row.takeaways.filter((item: unknown): item is string => typeof item === "string") : null,
      metered: true,
    };
  } catch {
    return { allowed: false, remaining: 0, reason: "service_unavailable", body: null, takeaways: null, metered: true };
  }
}

async function getEmergencyOpenArticleContent(slug: string, locale: Locale) {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("get_server_open_article_content", {
      p_article_slug: slug,
      p_locale: locale,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (Array.isArray(row?.body) && Array.isArray(row?.takeaways)) {
        return { body: row.body as string[], takeaways: row.takeaways as string[] };
      }
    }
  } catch {
    // The server-only rollback RPC is introduced by the final cutover
    // migration. Until then, continue using the inaugural public RPC.
  }
  return getOpenArticleContent(slug, locale);
}
