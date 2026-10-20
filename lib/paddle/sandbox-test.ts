import "server-only";
import { getPaddleEnvironment } from "./config";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function isPaddleSandboxTester(email: string | null | undefined) {
  const testerEmail = process.env.PADDLE_SANDBOX_TESTER_EMAIL?.trim().toLowerCase();
  return Boolean(
    testerEmail
      && email
      && getPaddleEnvironment() === "sandbox"
      && email.trim().toLowerCase() === testerEmail,
  );
}

export function isPaddleSandboxTestRuntimeReady(email: string | null | undefined) {
  return isSupabaseConfigured() && isPaddleSandboxTester(email);
}
