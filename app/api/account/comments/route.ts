import { getOwnerPreview } from "@/lib/owner-preview/server";
import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readerDisplayName } from "@/lib/account/display";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSameOriginMutation } from "@/lib/security/request";

const schema = z.object({
  articleSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  body: z.string().trim().min(3).max(1500),
}).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  if (await getOwnerPreview()) return json({ error: "owner_preview_active" }, 409);
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_comment" }, 400);
  const context = await getAuthenticatedAccountContext();
  if (!context) return json({ error: "authentication_required" }, 401);
  if (context.effective.accessTier === "free") return json({ error: "subscriber_required" }, 403);
  if (!context.user.email || !context.user.email_confirmed_at) return json({ error: "verified_email_required" }, 403);

  const admin = createAdminSupabaseClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count, error: countError }, { data: article }] = await Promise.all([
    admin.from("article_comments").select("id", { count: "exact", head: true }).eq("user_id", context.user.id).gte("created_at", since),
    admin.from("articles").select("slug").eq("slug", parsed.data.articleSlug).eq("status", "published").maybeSingle(),
  ]);
  if (countError || !article) return json({ error: "lookup_failed" }, 500);
  if ((count ?? 0) >= 5) return json({ error: "rate_limit" }, 429);
  const { error } = await admin.from("article_comments").insert({
    article_slug: parsed.data.articleSlug,
    user_id: context.user.id,
    author_display_name: readerDisplayName(context.user.user_metadata, context.user.email),
    body: parsed.data.body,
  });
  if (error?.code === "P0001" && error.message === "reader_rate_limit") return json({ error: "rate_limit" }, 429);
  return error ? json({ error: "submit_failed" }, 500) : json({ ok: true, state: "pending_moderation" }, 201);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
