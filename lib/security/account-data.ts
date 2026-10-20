import "server-only";

const encoder = new TextEncoder();

async function hmacKey() {
  const secret = process.env.ACCOUNT_DATA_HMAC_SECRET;
  if (!secret || secret.length < 32) return null;
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function hex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashAccountEmail(email: string) {
  const key = await hmacKey();
  if (!key) return null;
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`email:${normalizeAccountEmail(email)}`)));
}

export async function hashInviteToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`invite:${token}`));
  return hex(digest);
}

export function createInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function maskAccountEmail(email: string) {
  const normalized = normalizeAccountEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "e-mail convidado";
  return `${local.slice(0, 2)}${"•".repeat(Math.min(6, Math.max(2, local.length - 2)))}@${domain}`.slice(0, 160);
}

export function isAccountDataProtectionReady() {
  return Boolean(process.env.ACCOUNT_DATA_HMAC_SECRET && process.env.ACCOUNT_DATA_HMAC_SECRET.length >= 32);
}
