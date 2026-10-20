import "server-only";
import type { NextRequest, NextResponse } from "next/server";

export const READER_COOKIE = "ssz_reader_v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function hmacKey() {
  const secret = process.env.READER_COOKIE_SECRET;
  if (!secret || secret.length < 32) return null;
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
}

export async function signReaderId(readerId: string) {
  const key = await hmacKey();
  if (!key || !UUID.test(readerId)) return null;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(readerId));
  return `${readerId}.${hex(signature)}`;
}

export async function verifyReaderCookie(value: string | undefined | null) {
  if (!value) return null;
  const [readerId, encodedSignature, ...extra] = value.split(".");
  const signature = fromHex(encodedSignature ?? "");
  const key = await hmacKey();
  if (extra.length || !key || !signature || !UUID.test(readerId)) return null;
  const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(readerId));
  return valid ? readerId : null;
}

export async function hashReaderDevice(readerId: string | null) {
  const key = await hmacKey();
  if (!key || !readerId || !UUID.test(readerId)) return null;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`device:${readerId}`));
  return hex(digest);
}

export async function ensureReaderCookie(request: NextRequest) {
  const current = request.cookies.get(READER_COOKIE)?.value;
  if (await verifyReaderCookie(current)) return { value: current!, created: false };
  const value = await signReaderId(crypto.randomUUID());
  if (!value) return null;
  request.cookies.set(READER_COOKIE, value);
  return { value, created: true };
}

export function persistReaderCookie(response: NextResponse, value: string) {
  response.cookies.set(READER_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    priority: "high",
  });
}
