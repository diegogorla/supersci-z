const PRIVATE_PATH = /^\/(?:entrar|gestao|conta|auth|api)(?:\/|$)/;

export function newScriptNonce() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
}

// Explicit reading routes only: new privileged routes remain denied by default.
export function permitsChatGptViewer(pathname: string) {
  return /^\/(?:$|revista\/?$|(?:artigo|tema)\/[a-z0-9-]+\/?$|(?:sobre|contato|privacidade|termos|cookies|reembolsos-cancelamentos)\/?$)/.test(pathname);
}

export function contentSecurityPolicy(nonce: string, allowViewer = false) {
  if (!/^[A-Za-z0-9+/]{32}$/.test(nonce)) throw new Error("Invalid script nonce");
  return [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", allowViewer ? "frame-ancestors https://chatgpt.com" : "frame-ancestors 'none'", "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' https://cdn.paddle.com https://*.paddle.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://fundingchoicesmessages.google.com https://www.googletagmanager.com https://tracker.metricool.com`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://*.paddle.com",
    "font-src 'self' data:", "img-src 'self' data: blob: https:",
    "frame-src 'self' https://paddle.com https://*.paddle.com https://*.googlesyndication.com https://*.doubleclick.net https://fundingchoicesmessages.google.com",
    "connect-src 'self' https://paddle.com https://*.paddle.com wss://*.paddle.com https://*.googlesyndication.com https://*.doubleclick.net https://fundingchoicesmessages.google.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://tracker.metricool.com",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Reject source/credential paths even if a future asset package includes them. */
export function isPrivateAssetPath(pathname: string) {
  let path = pathname;
  for (let i = 0; i < 3; i++) {
    try { const next = decodeURIComponent(path); if (next === path) break; path = next; }
    catch { return true; }
  }
  path = path.replace(/\\/g, "/");
  return /(?:^|\/)\.(?:env(?:[./]|$)|git(?:\/|$)|openai(?:\/|$)|codex(?:\/|$)|agents(?:\/|$))|\.(?:pem|key|map)$/i.test(path)
    || /^\/(?:node_modules|work|outputs|supabase|scripts|lib|worker|sources|docs)(?:\/|$)/i.test(path)
    || /^\/(?:package(?:-lock)?\.json|AGENTS\.md|wrangler\.(?:jsonc?|toml)|vite\.config\.[jt]s)$/i.test(path);
}

export function withSecurityHeaders(response: Response, request: Request, nonce: string) {
  const secured = new Response(response.body, response);
  const pathname = new URL(request.url).pathname;
  const privatePath = PRIVATE_PATH.test(pathname);
  const allowViewer = ["GET", "HEAD"].includes(request.method) && permitsChatGptViewer(pathname);
  // Preserve the optimizer's stricter script prohibition and sandbox.
  secured.headers.set("Content-Security-Policy", pathname === "/_vinext/image"
    ? "default-src 'none'; script-src 'none'; frame-src 'none'; sandbox;"
    : contentSecurityPolicy(nonce, allowViewer));
  secured.headers.set("Referrer-Policy", privatePath ? "no-referrer" : "strict-origin-when-cross-origin");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  // CSP supports an exact cross-origin allowlist; X-Frame-Options does not.
  if (allowViewer) secured.headers.delete("X-Frame-Options");
  else secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Permissions-Policy", 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.paddle.com" "https://sandbox-checkout.paddle.com"), usb=(), serial=(), bluetooth=()');
  secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const contentType = secured.headers.get("content-type") ?? "";
  // HTML/RSC can contain a personalized header or authorized article text.
  if (privatePath || /text\/(?:html|x-component)/i.test(contentType) || secured.headers.has("set-cookie")) {
    secured.headers.set("Cache-Control", "private, no-store, max-age=0");
    secured.headers.set("CDN-Cache-Control", "no-store");
    secured.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  }
  if (privatePath) secured.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return secured;
}
