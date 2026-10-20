import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSameOriginMutation } from "@/lib/security/request";

const schema = z.object({ body: z.string().trim().min(10).max(2000) }).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_question" }, 400);
  const context = await getAuthenticatedAccountContext();
  if (!context) return json({ error: "authentication_required" }, 401);
  const admin = createAdminSupabaseClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin.from("editorial_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id)
    .gte("created_at", since);
  if (countError) return json({ error: "lookup_failed" }, 500);
  if ((count ?? 0) >= 3) return json({ error: "rate_limit" }, 429);
  const { error } = await admin.from("editorial_questions").insert({
    user_id: context.user.id,
    body: parsed.data.body,
    priority: context.effective.accessTier === "cosmos",
  });
  if (error?.code === "P0001" && error.message === "reader_rate_limit") return json({ error: "rate_limit" }, 429);
  return error ? json({ error: "submit_failed" }, 500) : json({ ok: true, priority: context.effective.accessTier === "cosmos" }, 201);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
