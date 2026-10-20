import "server-only";
import { z } from "zod";
import { articles as inauguralArticles, type Locale, type PublicArticle } from "@/app/content-public";

const localeCopySchema = z.object({
  category: z.string().min(2).max(160),
  title: z.string().min(4).max(300),
  dek: z.string().min(10).max(1000),
}).strict();

const articleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  date: z.string().date(),
  readMinutes: z.number().int().min(1).max(60),
  image: z.string().url().startsWith("https://").nullable(),
  imageAlt: z.string().min(2).max(2000).nullable(),
  imageCredit: z.string().min(2).max(300).nullable(),
  imageCreditUrl: z.string().url().startsWith("https://").nullable(),
  sourceName: z.string().min(2).max(500),
  sourceUrl: z.string().url().startsWith("https://"),
  isDaily: z.boolean(),
  topics: z.array(z.enum(["language", "mind", "society", "physics", "cosmos"])).min(1).max(5),
  copy: z.object({
    pt: localeCopySchema,
    en: localeCopySchema,
    es: localeCopySchema,
    zh: localeCopySchema,
    hi: localeCopySchema,
    ja: localeCopySchema,
    ru: localeCopySchema,
  }).strict(),
}).strict().refine((article) => article.image === null
  ? article.imageAlt === null && article.imageCredit === null && article.imageCreditUrl === null
  : article.imageAlt !== null && article.imageCredit !== null && article.imageCreditUrl !== null,
{ message: "Article images must have complete attribution or be fully withdrawn." });

const articleListSchema = z.array(z.unknown()).max(500);
const openContentSchema = z.array(z.object({
  body: z.array(z.string().min(1).max(10000)).min(1).max(100),
  takeaways: z.array(z.string().min(1).max(2000)).min(1).max(30),
}).strict()).max(1);

export async function getPublicArticles(): Promise<PublicArticle[]> {
  try {
    const payload = await callPublicRpc("get_published_article_index", { p_limit: 500 });
    const parsed = articleListSchema.safeParse(payload);
    if (!parsed.success || parsed.data.length === 0) return inauguralArticles;
    // A malformed legacy record must not hide every valid published article.
    const articles = parsed.data.flatMap((entry) => {
      const article = articleSchema.safeParse(entry);
      return article.success ? [article.data as PublicArticle] : [];
    });
    return articles.length ? articles : inauguralArticles;
  } catch {
    return inauguralArticles;
  }
}

export async function getPublicArticle(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return (await getPublicArticles()).find((article) => article.slug === slug) ?? null;
}

export async function getOpenArticleContent(slug: string, locale: Locale) {
  try {
    const payload = await callPublicRpc("get_open_article_content", { p_article_slug: slug, p_locale: locale });
    const parsed = openContentSchema.safeParse(payload);
    return parsed.success && parsed.data[0] ? parsed.data[0] : null;
  } catch {
    return null;
  }
}

async function callPublicRpc(name: string, body: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public runtime is not configured.");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase public RPC failed with status ${response.status}.`);
  return response.json() as Promise<unknown>;
}
