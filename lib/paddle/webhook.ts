const encoder = new TextEncoder();

function parseSignature(header: string) {
  const parts = header.split(";").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "ts")?.[1];
  const signatures = parts.filter(([key, value]) => key === "h1" && value).map(([, value]) => value);
  return { timestamp, signatures };
}

function equalHex(left: string, right: string) {
  if (left.length !== right.length || !/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyPaddleSignature(rawBody: string, header: string, secret: string, toleranceSeconds = 30) {
  const { timestamp, signatures } = parseSignature(header);
  if (!timestamp || signatures.length === 0 || !/^\d{10}$/.test(timestamp)) return false;
  const age = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(age) || age > toleranceSeconds * 1000) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}:${rawBody}`));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => equalHex(expected, signature));
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
