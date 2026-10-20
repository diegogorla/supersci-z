import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/security/request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const preferencesSchema = z.object({
  email_opt_in: z.boolean(),
  whatsapp_opt_in: z.boolean(),
  telegram_opt_in: z.boolean(),
  sms_opt_in: z.boolean(),
}).strict();

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);

  const parsed = preferencesSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return json({ error: "authentication_required" }, 401);

  const { error } = await supabase.from("communication_preferences").upsert({ user_id: userId, ...parsed.data });
  return error ? json({ error: "save_failed" }, 500) : json({ ok: true });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
