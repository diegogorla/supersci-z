import "server-only";
import { isMembershipEnabled } from "./config";
import { isPaddleLiveRuntimeReady } from "@/lib/paddle/config";

export function isMembershipInfrastructureReady() {
  const adminKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    adminKey &&
      process.env.READER_COOKIE_SECRET &&
      process.env.READER_COOKIE_SECRET.length >= 32,
  );
}

export function isMembershipRuntimeReady() {
  return isMembershipEnabled() && isMembershipInfrastructureReady() && isPaddleLiveRuntimeReady();
}
