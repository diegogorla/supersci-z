/** Measure public reading surfaces; exclude queries, fragments and account URLs. */
export function analyticsPagePath(pathname: string): string | null {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  return /^(?:\/(?:revista|sobre|contato|privacidade|cookies|termos|reembolsos-cancelamentos)?|\/(?:artigo|tema)\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(path) ? path : null;
}

export function analyticsPageFields(origin: string, pathname: string, title: string) {
  const path = analyticsPagePath(pathname);
  if (!path) return null;
  return { page_location: new URL(path, origin).href, page_path: path, page_title: title, page_referrer: "" };
}
