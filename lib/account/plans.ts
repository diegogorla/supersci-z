export const ACCESS_TIER_LABELS = {
  free: "Free",
  founder: "Fundador",
  cosmos: "Cosmos",
  lifetime: "Vitalício",
} as const;

export type AccessTier = keyof typeof ACCESS_TIER_LABELS;

export const PLAN_PRESENTATION = {
  founder_monthly: { name: "Fundador mensal", price: "R$ 7,90", cadence: "por mês", recurring: true },
  founder_annual: { name: "Fundador anual", price: "R$ 79,00", cadence: "por ano", recurring: true },
  founder_annual_pix: { name: "Fundador anual via Pix", price: "R$ 79,00", cadence: "pagamento anual", recurring: false },
  cosmos_monthly: { name: "Cosmos mensal", price: "R$ 19,90", cadence: "por mês", recurring: true },
  cosmos_annual: { name: "Cosmos anual", price: "R$ 199,00", cadence: "por ano", recurring: true },
  lifetime: { name: "Acesso vitalício", price: "R$ 399,00", cadence: "pagamento único", recurring: false },
} as const;

export type PlanCode = keyof typeof PLAN_PRESENTATION;

export function isAccessTier(value: unknown): value is AccessTier {
  return typeof value === "string" && value in ACCESS_TIER_LABELS;
}

export function getPlanPresentation(planCode: string | null | undefined) {
  if (!planCode || !(planCode in PLAN_PRESENTATION)) return null;
  return PLAN_PRESENTATION[planCode as PlanCode];
}
