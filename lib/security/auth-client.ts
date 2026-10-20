/** The browser receives an outcome, never an access/refresh token or user record. */
export async function authRequest(input: Record<string, unknown>): Promise<{ ok: boolean; url?: string; next?: string }> {
  try {
    const response = await fetch("/api/auth/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) return { ok: false };
    const data = await response.json();
    return { ok: data.ok === true, url: typeof data.url === "string" ? data.url : undefined, next: typeof data.next === "string" ? data.next : undefined };
  } catch { return { ok: false }; }
}
