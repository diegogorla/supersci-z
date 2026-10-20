import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/security/request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  stage: z.enum(["script_load", "initialize", "checkout_open"]),
  code: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
}).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return NextResponse.json({ error: "authentication_required" }, { status: 401 });

  console.error(`[paddle-client] stage=${parsed.data.stage} code=${parsed.data.code}`);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
