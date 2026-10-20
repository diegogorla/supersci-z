import type { AccessTier } from "@/lib/account/plans";

export type AdExperience = "standard" | "none";

export type PageAdConfig = {
  publisherId: string;
  multiplexSlotId: string;
  experience: AdExperience;
};

export function adExperienceForAccess(accessTier: AccessTier, adsEnabled: boolean | null | undefined): AdExperience {
  if (accessTier !== "free" || adsEnabled === false) return "none";
  return "standard";
}

export function adExperienceLabel(experience: AdExperience) {
  if (experience === "none") return "Sem anúncios";
  return "Padrão";
}
