import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/security/request";
import { readBoundedJson } from "@/lib/security/request-body";
import { isVerifiedPreviewOwner } from "@/lib/owner-preview/server";
import { OWNER_PREVIEW_COOKIE, OWNER_PREVIEW_MODES, serializeOwnerPreviewCookie } from "@/lib/owner-preview/model";

const schema = z.object({
  mode: z.enum(OWNER_PREVIEW_MODES).nullable(),
  exhausted: z.boolean().default(false),
}).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const parsed = schema.safeParse(await readBoundedJson(request, 512).catch(() => null));
  if (!parsed.success || (parsed.data.exhausted && parsed.data.mode !== "visitor")) {
    return json({ error: "invalid_preview" }, 400);
  }
  if (!(await isVerifiedPreviewOwner())) return json({ error: "owner_required" }, 403);
  const response = json({ ok: true });
  response.cookies.set(OWNER_PREVIEW_COOKIE,
    parsed.data.mode ? serializeOwnerPreviewCookie({ mode: parsed.data.mode, exhausted: parsed.data.exhausted }) : "",
    { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: parsed.data.mode ? 1800 : 0 });
  return response;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
