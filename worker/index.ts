/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { contentSecurityPolicy, isPrivateAssetPath, newScriptNonce, withSecurityHeaders } from "../lib/security/headers";
import { readBoundedText, RequestBodyError } from "../lib/security/request-body";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB?: import("@cloudflare/workers-types").D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  ADSENSE_ARTICLE_SLOT_ID?: string;
  ACCOUNT_DATA_HMAC_SECRET?: string;
  ADSENSE_ENABLED?: string;
  ADSENSE_FEED_SLOT_ID?: string;
  ADSENSE_PUBLISHER_ID?: string;
  GOOGLE_CMP_ENABLED?: string;
  GOOGLE_ANALYTICS_ENABLED?: string;
  GOOGLE_ANALYTICS_MEASUREMENT_ID?: string;
  MEMBERSHIP_ENABLED?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  PADDLE_API_KEY?: string;
  PADDLE_CLIENT_TOKEN?: string;
  PADDLE_ENVIRONMENT?: string;
  PADDLE_PRICE_COSMOS_ANNUAL?: string;
  PADDLE_PRICE_COSMOS_MONTHLY?: string;
  PADDLE_PRICE_FOUNDER_ANNUAL?: string;
  PADDLE_PRICE_FOUNDER_ANNUAL_PIX?: string;
  PADDLE_PRICE_FOUNDER_MONTHLY?: string;
  PADDLE_PRICE_LIFETIME?: string;
  PADDLE_SANDBOX_TESTER_EMAIL?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_SANDBOX_API_KEY?: string;
  PADDLE_SANDBOX_CLIENT_TOKEN?: string;
  PADDLE_SANDBOX_WEBHOOK_SECRET?: string;
  PADDLE_SANDBOX_PRICE_COSMOS_ANNUAL?: string;
  PADDLE_SANDBOX_PRICE_COSMOS_MONTHLY?: string;
  PADDLE_SANDBOX_PRICE_FOUNDER_ANNUAL?: string;
  PADDLE_SANDBOX_PRICE_FOUNDER_ANNUAL_PIX?: string;
  PADDLE_SANDBOX_PRICE_FOUNDER_MONTHLY?: string;
  PADDLE_SANDBOX_PRICE_LIFETIME?: string;
  PADDLE_LIVE_API_KEY?: string;
  PADDLE_LIVE_CLIENT_TOKEN?: string;
  PADDLE_LIVE_WEBHOOK_SECRET?: string;
  PADDLE_LIVE_PRICE_COSMOS_ANNUAL?: string;
  PADDLE_LIVE_PRICE_COSMOS_MONTHLY?: string;
  PADDLE_LIVE_PRICE_FOUNDER_ANNUAL?: string;
  PADDLE_LIVE_PRICE_FOUNDER_ANNUAL_PIX?: string;
  PADDLE_LIVE_PRICE_FOUNDER_MONTHLY?: string;
  PADDLE_LIVE_PRICE_LIFETIME?: string;
  PADDLE_LIVE_TESTER_EMAIL?: string;
  PADDLE_LIVE_TESTER_EMAILS?: string;
  READER_COOKIE_SECRET?: string;
  SUPABASE_SECRET_KEY?: string;
  TOKEN_HOSTINGER_EMAIL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_APPLE_ENABLED?: string;
  SUPABASE_EMAIL_AUTH_MODE?: string;
  SUPABASE_GOOGLE_ENABLED?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env = {} as Env, ctx: ExecutionContext): Promise<Response> {
    populateServerEnvironment(env);
    const url = new URL(request.url);
    const nonce = newScriptNonce();
    // Keep public reading and assets on the Sites origin for the embedded viewer.
    // Sensitive flows still use the primary domain and its authentication cookies.
    const sensitivePath = /^\/(?:entrar|gestao|conta|auth|api|assine)(?:\/|$)/.test(url.pathname);
    if (url.hostname === "www.supersci-z.com" || (url.hostname === "super-sci-z.dgorla.chatgpt.site" && sensitivePath)) {
      const canonical = new URL(url.pathname + url.search, "https://supersci-z.com");
      return withSecurityHeaders(Response.redirect(canonical, 308), request, nonce);
    }
    if (isPrivateAssetPath(url.pathname)) return withSecurityHeaders(new Response("Not found", { status: 404 }), request, nonce);
    if (["/revista", "/revista/"].includes(url.pathname) && ["GET", "HEAD"].includes(request.method)) {
      const lang = url.searchParams.get("lang");
      const destination = lang && ["en", "es", "zh", "hi", "ja", "ru"].includes(lang) ? "/?lang=" + lang : "/";
      return withSecurityHeaders(new Response(null, { status: 308, headers: { Location: destination } }), request, nonce);
    }
    // Overwrite caller-supplied policy/nonce; only this worker creates trust.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("content-security-policy", contentSecurityPolicy(nonce));
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.delete("content-security-policy-report-only");
    for (const header of [...requestHeaders.keys()]) if (header.startsWith("x-middleware-") || ["x-invoke-path", "x-invoke-query", "x-now-route-matches"].includes(header)) requestHeaders.delete(header);
    // The magazine authorizes through verified Supabase sessions, not identity headers.
    for (const header of [...requestHeaders.keys()]) if (header.startsWith("oai-authenticated-user-")) requestHeaders.delete(header);
    let securedRequest = new Request(request, { headers: requestHeaders });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      // All current APIs accept JSON; no file upload or server-action execution is exposed.
      if (!url.pathname.startsWith("/api/")) return withSecurityHeaders(new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } }), request, nonce);
      try {
        const limit = url.pathname === "/api/paddle/webhook" ? 1_048_576 : 16_384;
        const body = await readBoundedText(securedRequest, limit);
        securedRequest = new Request(request.url, { method: request.method, headers: requestHeaders, body });
      } catch (error) {
        const status = error instanceof RequestBodyError ? error.status : 400;
        return withSecurityHeaders(new Response("Invalid request body", { status }), request, nonce);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const imageResponse = await handleImageOptimization(securedRequest, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(imageResponse, request, nonce);
    }

    const response = await handler.fetch(securedRequest, env, ctx);
    return withSecurityHeaders(response, request, nonce);
  },
};

const SERVER_ENV_KEYS = [
  "ACCOUNT_DATA_HMAC_SECRET",
  "ADSENSE_ARTICLE_SLOT_ID",
  "ADSENSE_ENABLED",
  "ADSENSE_FEED_SLOT_ID",
  "ADSENSE_PUBLISHER_ID",
  "GOOGLE_CMP_ENABLED",
  "GOOGLE_ANALYTICS_ENABLED",
  "GOOGLE_ANALYTICS_MEASUREMENT_ID",
  "MEMBERSHIP_ENABLED",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "PADDLE_API_KEY",
  "PADDLE_CLIENT_TOKEN",
  "PADDLE_ENVIRONMENT",
  "PADDLE_PRICE_COSMOS_ANNUAL",
  "PADDLE_PRICE_COSMOS_MONTHLY",
  "PADDLE_PRICE_FOUNDER_ANNUAL",
  "PADDLE_PRICE_FOUNDER_ANNUAL_PIX",
  "PADDLE_PRICE_FOUNDER_MONTHLY",
  "PADDLE_PRICE_LIFETIME",
  "PADDLE_SANDBOX_TESTER_EMAIL",
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_SANDBOX_API_KEY",
  "PADDLE_SANDBOX_CLIENT_TOKEN",
  "PADDLE_SANDBOX_WEBHOOK_SECRET",
  "PADDLE_SANDBOX_PRICE_COSMOS_ANNUAL",
  "PADDLE_SANDBOX_PRICE_COSMOS_MONTHLY",
  "PADDLE_SANDBOX_PRICE_FOUNDER_ANNUAL",
  "PADDLE_SANDBOX_PRICE_FOUNDER_ANNUAL_PIX",
  "PADDLE_SANDBOX_PRICE_FOUNDER_MONTHLY",
  "PADDLE_SANDBOX_PRICE_LIFETIME",
  "PADDLE_LIVE_API_KEY",
  "PADDLE_LIVE_CLIENT_TOKEN",
  "PADDLE_LIVE_WEBHOOK_SECRET",
  "PADDLE_LIVE_PRICE_COSMOS_ANNUAL",
  "PADDLE_LIVE_PRICE_COSMOS_MONTHLY",
  "PADDLE_LIVE_PRICE_FOUNDER_ANNUAL",
  "PADDLE_LIVE_PRICE_FOUNDER_ANNUAL_PIX",
  "PADDLE_LIVE_PRICE_FOUNDER_MONTHLY",
  "PADDLE_LIVE_PRICE_LIFETIME",
  "PADDLE_LIVE_TESTER_EMAIL",
  "PADDLE_LIVE_TESTER_EMAILS",
  "READER_COOKIE_SECRET",
  "SUPABASE_SECRET_KEY",
  "TOKEN_HOSTINGER_EMAIL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_APPLE_ENABLED",
  "SUPABASE_EMAIL_AUTH_MODE",
  "SUPABASE_GOOGLE_ENABLED",
] as const;

function populateServerEnvironment(env: Env) {
  for (const key of SERVER_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string") process.env[key] = value;
  }
}

export default worker;
