import { getOwnerPreview } from "@/lib/owner-preview/server";
import "server-only";

import { activeAccessTier } from "./display";
import { isAccessTier, type AccessTier } from "./plans";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ViewerSummary = {
  accessTier: AccessTier;
  sharedAccess: boolean;
};

type EffectiveAccessRow = {
  access_tier?: unknown;
  owner_user_id?: unknown;
  valid_until?: string | null;
  revoked_at?: string | null;
  provider_environment?: string | null;
};

export async function getViewerSummary(): Promise<ViewerSummary | null> {
  const preview = await getOwnerPreview();
  if (preview) return preview.mode === "visitor" ? null : { accessTier: preview.accessTier, sharedAccess: preview.sharedAccess };
  if (!isSupabaseConfigured()) return null;
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsError || !userId) return null;

  const [{ data: userData, error: userError }, effectiveResult, entitlementResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_my_effective_access", { p_provider_environment: getPaddleEnvironment() }),
    supabase.from("entitlements")
      .select("access_tier,valid_until,revoked_at,provider_environment")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const user = userData.user;
  if (userError || !user || user.id !== userId) return null;

  const effective = (Array.isArray(effectiveResult.data) ? effectiveResult.data[0] : effectiveResult.data) as EffectiveAccessRow | null;
  const effectiveTier = effective && isAccessTier(effective.access_tier) ? effective.access_tier : null;
  const accessTier = !effectiveResult.error && effectiveTier
    ? effectiveTier
    : activeAccessTier(entitlementResult.data, getPaddleEnvironment());

  return {
    accessTier,
    sharedAccess: Boolean(effective?.owner_user_id && effective.owner_user_id !== userId),
  };
}
