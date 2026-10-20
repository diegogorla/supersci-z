const SAFE_BASE_URL = "https://supersci-z.invalid";
const SAFE_STATIC_PATHS = new Set(["/", "/conta", "/revista", "/assine"]);
const ARTICLE_PATH = /^\/artigo\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_LOCALES = new Set(["pt", "en", "es", "zh", "hi", "ja", "ru"]);

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 512 || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return "/conta";
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/conta";
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) {
    return "/conta";
  }

  try {
    const parsed = new URL(decoded, SAFE_BASE_URL);
    if (parsed.origin === SAFE_BASE_URL && parsed.pathname === "/conta/convite" && !parsed.hash && [...parsed.searchParams.keys()].length === 1) {
      const token = parsed.searchParams.get("token");
      if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) return `/conta/convite?token=${token}`;
    }
    const allowedPath = SAFE_STATIC_PATHS.has(parsed.pathname) || ARTICLE_PATH.test(parsed.pathname);
    if (parsed.origin !== SAFE_BASE_URL || !allowedPath || parsed.username || parsed.password || parsed.hash) {
      return "/conta";
    }

    const locale = parsed.searchParams.get("lang");
    if ([...parsed.searchParams.keys()].some((key) => key !== "lang") || (locale && !SAFE_LOCALES.has(locale))) {
      return "/conta";
    }

    return `${parsed.pathname}${locale ? `?lang=${locale}` : ""}`;
  } catch {
    return "/conta";
  }
}

