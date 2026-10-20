// Keep Worker-only globals out of the browser DOM type environment.
declare module "cloudflare:workers" {
  export const env: { DB?: import("@cloudflare/workers-types").D1Database };
}
