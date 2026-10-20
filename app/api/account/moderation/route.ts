import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSameOriginMutation } from "@/lib/security/request";

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("comment"),
    id: z.string().uuid(),
    action: z.enum(["published", "rejected", "hidden"]),
  }).strict(),
  z.object({
    type: z.literal("question"),
    id: z.string().uuid(),
    action: z.enum(["reviewing", "answered", "closed"]),
  }).strict(),
]);

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const context = await getAuthenticatedAccountContext();
  if (!context) return json({ error: "authentication_required" }, 401);
  if (context.authority !== "editor" && context.authority !== "admin") return json({ error: "editor_required" }, 403);

  const admin = createAdminSupabaseClient();
  const updatedAt = new Date().toISOString();
  if (parsed.data.type === "comment") {
    const { data, error } = await admin.from("article_comments")
      .update({ status: parsed.data.action, updated_at: updatedAt })
      .eq("id", parsed.data.id)
      .select("id")
      .maybeSingle();
    return error || !data ? json({ error: "not_found" }, 404) : json({ ok: true });
  }

  const { data, error } = await admin.from("editorial_questions")
    .update({ status: parsed.data.action, updated_at: updatedAt })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  return error || !data ? json({ error: "not_found" }, 404) : json({ ok: true });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
