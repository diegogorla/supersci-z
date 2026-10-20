import { getOwnerPreview } from "@/lib/owner-preview/server";
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getAdsenseMultiplexSlotId, getAdsensePublisherId, isAdsenseRuntimeReady } from "./config";
import { getPublicSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adExperienceForAccess, type AdExperience, type PageAdConfig } from "./experience";
import { getAuthenticatedAccountContext } from "@/lib/account/server";

const getPageAdAccess = cache(async (): Promise<{ publisherId: string; experience: AdExperience } | null> => {
  // A server-authorized visual preview must never load real advertising.
  if (await getOwnerPreview()) return null;
  const publisherId = getAdsensePublisherId();
  if (!publisherId) return null;
  const standard = { publisherId, experience: "standard" as const };
  // Ad-free benefits remain valid even while checkout or reading quotas are paused.
  if (!isSupabaseConfigured()) return null;

  try {
    // Remember session presence before the SDK can discard a malformed cookie.
    // An uncertain signed-in state must never remove a paid advertising benefit.
    const cookieStore = await cookies();
    const prefix = "sb-" + new URL(getPublicSupabaseConfig().url).hostname.split(".")[0] + "-auth-token";
    const hasSessionCookie = cookieStore.getAll().some(({ name }) =>
      name === prefix || (name.startsWith(prefix + ".") && /^\d+$/.test(name.slice(prefix.length + 1))),
    );
    const supabase = await createServerSupabaseClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError) return null;
    // The provider's explicit empty-session outcome and no session cookie are
    // both required before serving the standard anonymous advertising policy.
    if (!claims) return hasSessionCookie ? null : standard;
    if (typeof claims.claims?.sub !== "string" || !claims.claims.sub) return null;
    const context = await getAuthenticatedAccountContext();
    if (!context || context.user.id !== claims.claims.sub) return null;
    if (!context.entitlementResolved) return null;
    const accessTier = context.effective.accessTier;
    const adsEnabled = accessTier === "free" ? true : context.effective.adsEnabled;
    const experience = adExperienceForAccess(accessTier, adsEnabled);
    // An ad-free benefit excludes the Google advertising script itself.
    if (experience === "none") return null;
    return { publisherId, experience };
  } catch {
    // Provider, cookie or entitlement failures leave advertising disabled.
    return null;
  }
});

// Site review requires the publisher script in public HTML before ads are enabled.
// This is independent of slot activation and excludes every paid access tier.
export async function getAdsenseVerificationPublisherId(): Promise<string | null> {
  const access = await getPageAdAccess();
  return access?.experience === "standard" ? access.publisherId : null;
}

export async function getPageAdConfig(): Promise<PageAdConfig | null> {
  if (!isAdsenseRuntimeReady()) return null;
  const access = await getPageAdAccess();
  const multiplexSlotId = getAdsenseMultiplexSlotId();
  if (!access || access.experience !== "standard" || !multiplexSlotId) return null;
  return { ...access, multiplexSlotId };
}
