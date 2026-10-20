import "server-only";
import { isPaddleClientTokenForEnvironment } from "./environment";

export const PADDLE_PLAN_CODES = [
  "founder_monthly",
  "founder_annual",
  "founder_annual_pix",
  "cosmos_monthly",
  "cosmos_annual",
  "lifetime",
] as const;

export type PaddlePlanCode = (typeof PADDLE_PLAN_CODES)[number];

const priceSuffix: Record<PaddlePlanCode, string> = {
  founder_monthly: "PRICE_FOUNDER_MONTHLY",
  founder_annual: "PRICE_FOUNDER_ANNUAL",
  founder_annual_pix: "PRICE_FOUNDER_ANNUAL_PIX",
  cosmos_monthly: "PRICE_COSMOS_MONTHLY",
  cosmos_annual: "PRICE_COSMOS_ANNUAL",
  lifetime: "PRICE_LIFETIME",
};

export function getPaddleEnvironment() {
  return process.env.PADDLE_ENVIRONMENT === "live" ? "live" : "sandbox";
}

function scopedValue(suffix: string) {
  const environment = getPaddleEnvironment();
  const scoped = process.env[`PADDLE_${environment.toUpperCase()}_${suffix}`]?.trim();
  if (scoped) return scoped;
  // The original unscoped variables belong exclusively to the already-tested
  // Sandbox integration. Live never falls back to them.
  return environment === "sandbox" ? process.env[`PADDLE_${suffix}`]?.trim() || null : null;
}

export function getPaddlePriceId(plan: PaddlePlanCode) {
  const value = scopedValue(priceSuffix[plan]);
  return value && /^pri_[a-z0-9]{26}$/.test(value) ? value : null;
}

function getPaddleClientToken() {
  const token = scopedValue("CLIENT_TOKEN");
  const environment = getPaddleEnvironment();
  return token && isPaddleClientTokenForEnvironment(token, environment) ? token : null;
}

export function isPaddleCheckoutReady(plan?: PaddlePlanCode) {
  const token = getPaddleClientToken();
  if (!token) return false;
  return plan ? Boolean(getPaddlePriceId(plan)) : PADDLE_PLAN_CODES.every((code) => getPaddlePriceId(code));
}

export function getPaddleCheckoutConfig(plan: PaddlePlanCode) {
  const clientToken = getPaddleClientToken();
  const priceId = getPaddlePriceId(plan);
  if (!clientToken || !priceId) throw new Error("Paddle checkout is not configured.");
  return { clientToken, priceId, environment: getPaddleEnvironment() } as const;
}

export function getPaddleServerConfig() {
  const apiKey = scopedValue("API_KEY");
  if (!apiKey) throw new Error("Paddle API is not configured.");
  const environment = getPaddleEnvironment();
  return {
    apiKey,
    environment,
    apiBaseUrl: environment === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com",
  } as const;
}

export function getPaddleWebhookSecret() {
  const secret = scopedValue("WEBHOOK_SECRET");
  if (!secret) throw new Error("Paddle webhook is not configured.");
  return secret;
}

export function isPaddleServerReady() {
  try { getPaddleServerConfig(); return true; } catch { return false; }
}

export function isPaddleWebhookReady() {
  try { getPaddleWebhookSecret(); return true; } catch { return false; }
}

export function isPaddleLiveRuntimeReady() {
  return getPaddleEnvironment() === "live"
    && isPaddleCheckoutReady()
    && isPaddleServerReady()
    && isPaddleWebhookReady();
}
