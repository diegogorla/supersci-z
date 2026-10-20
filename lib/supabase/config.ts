export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function isMembershipEnabled() {
  return process.env.MEMBERSHIP_ENABLED === "true" && isSupabaseConfigured();
}

export function getPublicSupabaseConfig(): SupabasePublicConfig {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase ainda não foi configurado.");
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };
}
