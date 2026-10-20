import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type PublicArticleComment = {
  author: string;
  body: string;
  createdAt: string;
};

export async function getPublishedArticleComments(articleSlug: string): Promise<PublicArticleComment[]> {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("article_comments")
      .select("body,created_at")
      .eq("article_slug", articleSlug)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) return [];
    return (data ?? []).map((row) => ({ author: "Leitor SCI-Z", body: row.body, createdAt: row.created_at }));
  } catch {
    return [];
  }
}
