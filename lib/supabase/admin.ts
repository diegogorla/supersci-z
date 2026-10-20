import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./config";

export function createAdminSupabaseClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) throw new Error("A chave administrativa do Supabase não foi configurada.");
  const { url } = getPublicSupabaseConfig();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

