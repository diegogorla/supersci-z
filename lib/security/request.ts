const DEFAULT_SITE_ORIGIN = "https://supersci-z.com";

export function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_ORIGIN;
  try {
    return new URL(configured).origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite && fetchSite !== "same-origin")) return false;

  const allowed = new Set([
    siteOrigin(),
    "https://www.supersci-z.com",
  ]);
  return allowed.has(origin);
}

