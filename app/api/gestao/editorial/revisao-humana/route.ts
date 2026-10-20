import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { isSameOriginMutation } from "@/lib/security/request";
import { readBoundedJson, RequestBodyError } from "@/lib/security/request-body";

export const dynamic = "force-dynamic";

const schema = z.object({
  reviewId: z.string().uuid(),
  languageCount: z.number().int().min(0).max(100),
  adequacyCount: z.number().int().min(0).max(100),
  attractivenessCount: z.number().int().min(0).max(100),
  note: z.string().trim().max(4000),
  finalize: z.boolean(),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  try {
    const parsed = schema.safeParse(await readBoundedJson(request, 32_768));
    if (!parsed.success) return json({ error: "invalid_request" }, 400);
    const context = await getAuthenticatedAccountContext();
    if (!context) return json({ error: "authentication_required" }, 401);
    if (context.authority !== "admin") return json({ error: "administrator_required" }, 403);

    const { data, error } = await context.supabase.rpc("save_moe3_curation_counts_v2", {
      p_review_id: parsed.data.reviewId,
      p_language_count: parsed.data.languageCount,
      p_adequacy_count: parsed.data.adequacyCount,
      p_attractiveness_count: parsed.data.attractivenessCount,
      p_note: parsed.data.note,
      p_finalize: parsed.data.finalize,
    });
    if (error) {
      const reviewWindowOpen = /five-day review window/i.test(error.message ?? "");
      return json({ error: reviewWindowOpen ? "review_window_open" : "review_failed" }, reviewWindowOpen ? 409 : 503);
    }
    return json({ ok: true, result: data });
  } catch (error) {
    return error instanceof RequestBodyError
      ? json({ error: error.message }, error.status)
      : json({ error: "review_unavailable" }, 503);
  }
}
