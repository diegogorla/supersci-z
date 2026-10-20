import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { OWNER_PREVIEW_COOKIE, ownerPreviewProfile, parseOwnerPreviewCookie } from "./model";

// React cache deduplicates only within a server render. Never persist authorization.
export const isVerifiedPreviewOwner = cache(async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return false;
    const profile = await supabase.from("reader_profiles")
      .select("authority").eq("user_id", data.user.id).maybeSingle();
    return !profile.error && profile.data?.authority === "admin";
  } catch {
    return false;
  }
});

export const getOwnerPreview = cache(async () => {
  try {
    const selection = parseOwnerPreviewCookie((await cookies()).get(OWNER_PREVIEW_COOKIE)?.value);
    if (!selection || !(await isVerifiedPreviewOwner())) return null;
    return ownerPreviewProfile(selection);
  } catch {
    return null;
  }
});
