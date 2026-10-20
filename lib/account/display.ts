import { isAccessTier, type AccessTier } from "./plans";

type EntitlementIdentity = {
  access_tier?: unknown;
  valid_until?: string | null;
  revoked_at?: string | null;
  provider_environment?: string | null;
} | null;

export function readerDisplayName(metadata: Record<string, unknown> | null | undefined, email: string) {
  const candidates = [metadata?.full_name, metadata?.name, metadata?.given_name];
  const selected = candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const fallback = email.includes("@") ? email.split("@")[0] : "Leitor SUPER SCI-Z";
  return (selected ?? fallback).trim().slice(0, 80);
}

export function activeAccessTier(entitlement: EntitlementIdentity, environment: "sandbox" | "live"): AccessTier {
  if (!entitlement || entitlement.revoked_at) return "free";
  if (entitlement.provider_environment && entitlement.provider_environment !== environment) return "free";
  if (entitlement.valid_until && new Date(entitlement.valid_until) <= new Date()) return "free";
  return isAccessTier(entitlement.access_tier) ? entitlement.access_tier : "free";
}
