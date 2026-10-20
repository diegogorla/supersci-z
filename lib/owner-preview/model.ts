import type { AccessTier } from "@/lib/account/plans";
import type { AdExperience } from "@/lib/adsense/experience";

export const OWNER_PREVIEW_COOKIE = "sciz_owner_preview";
export const OWNER_PREVIEW_MODES = ["visitor", "founder", "cosmos", "cosmos_guest", "lifetime"] as const;
export type OwnerPreviewMode = typeof OWNER_PREVIEW_MODES[number];
export type OwnerPreviewSelection = { mode: OwnerPreviewMode; exhausted: boolean };
export type OwnerPreviewProfile = OwnerPreviewSelection & {
  label: string;
  accessTier: AccessTier;
  sharedAccess: boolean;
  experience: AdExperience;
  devices: number;
  invites: number;
};

const profiles: Record<OwnerPreviewMode, Omit<OwnerPreviewProfile, keyof OwnerPreviewSelection>> = {
  visitor: { label: "Visitante", accessTier: "free", sharedAccess: false, experience: "standard", devices: 1, invites: 0 },
  founder: { label: "Fundador", accessTier: "founder", sharedAccess: false, experience: "none", devices: 1, invites: 0 },
  cosmos: { label: "Cosmos titular", accessTier: "cosmos", sharedAccess: false, experience: "none", devices: 3, invites: 2 },
  cosmos_guest: { label: "Cosmos convidado", accessTier: "founder", sharedAccess: true, experience: "none", devices: 1, invites: 0 },
  lifetime: { label: "Vitalício", accessTier: "lifetime", sharedAccess: false, experience: "none", devices: 1, invites: 0 },
};

export function isOwnerPreviewMode(value: unknown): value is OwnerPreviewMode {
  return typeof value === "string" && OWNER_PREVIEW_MODES.some((mode) => mode === value);
}

/** The cookie is only a preference. The server must authorize its owner separately. */
export function parseOwnerPreviewCookie(value: unknown): OwnerPreviewSelection | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const [mode, reading, extra] = value.split(":");
  if (!isOwnerPreviewMode(mode) || extra !== undefined || !["available", "exhausted"].includes(reading)) return null;
  if (reading === "exhausted" && mode !== "visitor") return null;
  return { mode, exhausted: reading === "exhausted" };
}

export function ownerPreviewProfile(selection: OwnerPreviewSelection): OwnerPreviewProfile {
  return { ...profiles[selection.mode], ...selection };
}

export function serializeOwnerPreviewCookie(selection: OwnerPreviewSelection): string {
  return selection.mode + ":" + (selection.mode === "visitor" && selection.exhausted ? "exhausted" : "available");
}
