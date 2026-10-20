/** Sessions are handled by same-origin server routes, never the browser SDK. */
export const authCookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export function parseRequestCookies(header: string) {
  if (header.length > 32_768) return [];
  return header.split(";").flatMap((part) => {
    const index = part.indexOf("=");
    if (index < 1) return [];
    const name = part.slice(0, index).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return [];
    try { return [{ name, value: decodeURIComponent(part.slice(index + 1).trim()) }]; }
    catch { return []; }
  });
}
