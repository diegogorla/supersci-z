import "server-only";
import { isPaddleLiveRuntimeReady } from "./config";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function isPaddleLiveTester(email: string | null | undefined) {
  const candidate = email?.trim().toLowerCase();
  if (!candidate) return false;
  const configured = [
    process.env.PADDLE_LIVE_TESTER_EMAIL,
    process.env.PADDLE_LIVE_TESTER_EMAILS,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(candidate);
}

export function isPaddleLiveTestRuntimeReady(email: string | null | undefined) {
  return isSupabaseConfigured() && isPaddleLiveRuntimeReady() && isPaddleLiveTester(email);
}
