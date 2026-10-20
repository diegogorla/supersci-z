import "server-only";

import type { User } from "@supabase/supabase-js";
import { isAccessTier, type AccessTier } from "./plans";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type EffectiveAccess = {
  accessTier: AccessTier;
  ownerUserId: string;
  adsEnabled: boolean;
  deviceLimit: number;
  householdSlots: number;
  source: string;
  validUntil: string | null;
  providerEnvironment: string | null;
  sharedAccess: boolean;
};

export async function getAuthenticatedAccountContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  user: User;
  effective: EffectiveAccess;
  authority: "reader" | "editor" | "admin";
  entitlementResolved: boolean;
} | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.id) return null;

  const environment = getPaddleEnvironment();
  const [{ data: effectiveData, error: effectiveError }, { data: entitlement }, { data: profile }] = await Promise.all([
    supabase.rpc("get_my_effective_access", { p_provider_environment: environment }),
    supabase.from("entitlements")
      .select("access_tier,ads_enabled,device_limit,household_slots,source,valid_until,revoked_at,provider_environment")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("reader_profiles")
      .select("authority")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const row = Array.isArray(effectiveData) ? effectiveData[0] : effectiveData;
  const ownActive = entitlement
    && !entitlement.revoked_at
    && (!entitlement.valid_until || new Date(entitlement.valid_until) > new Date())
    && (!entitlement.provider_environment || entitlement.provider_environment === environment)
    ? entitlement
    : null;
  const tier = !effectiveError && isAccessTier(row?.access_tier)
    ? row.access_tier
    : ownActive && isAccessTier(ownActive.access_tier)
      ? ownActive.access_tier
      : "free";
  const ownerUserId = typeof row?.owner_user_id === "string" ? row.owner_user_id : user.id;

  return {
    supabase,
    user,
    entitlementResolved: !effectiveError && isAccessTier(row?.access_tier),
    authority: profile?.authority === "admin" || profile?.authority === "editor" ? profile.authority : "reader",
    effective: {
      accessTier: tier,
      ownerUserId,
      adsEnabled: typeof row?.ads_enabled === "boolean" ? row.ads_enabled : ownActive?.ads_enabled ?? true,
      deviceLimit: typeof row?.device_limit === "number" ? row.device_limit : ownActive?.device_limit ?? 1,
      householdSlots: typeof row?.household_slots === "number" ? row.household_slots : ownActive?.household_slots ?? 0,
      source: typeof row?.source === "string" ? row.source : ownActive?.source ?? "signup",
      validUntil: typeof row?.valid_until === "string" ? row.valid_until : ownActive?.valid_until ?? null,
      providerEnvironment: typeof row?.provider_environment === "string" ? row.provider_environment : ownActive?.provider_environment ?? null,
      sharedAccess: ownerUserId !== user.id,
    },
  };
}
