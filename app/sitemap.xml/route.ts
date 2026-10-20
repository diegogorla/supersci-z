import { localeCodes, localizedPath, topicSlugs } from "@/lib/seo/locales";
import { getPublicArticles } from "@/lib/content/public";

const origin = "https://supersci-z.com";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;",
  })[char]!);
}

export async function GET() {
  const articles = await getPublicArticles();
  const localizedEntries = [
    { path: "/", date: articles[0]?.date ?? "2026-09-08", frequency: "daily", priority: "1.0" },
    ...topicSlugs.map((topic) => ({ path: `/tema/${topic}`, date: "2026-08-27", frequency: "weekly", priority: "0.8" })),
    ...articles.map((article) => ({ path: `/artigo/${article.slug}`, date: article.date, frequency: article.isDaily ? "weekly" : "monthly", priority: article.isDaily ? "0.8" : "0.7" })),
  ].flatMap((entry) => localeCodes.map((locale) => ({ ...entry, url: `${origin}${localizedPath(entry.path, locale)}` })));
  const entries = [
    ...localizedEntries,
    { url: `${origin}/sobre`, date: "2026-08-27", frequency: "monthly", priority: "0.6" },
    { url: `${origin}/contato`, date: "2026-08-27", frequency: "yearly", priority: "0.5" },
    { url: `${origin}/privacidade`, date: "2026-08-27", frequency: "yearly", priority: "0.4" },
    { url: `${origin}/cookies`, date: "2026-08-27", frequency: "yearly", priority: "0.4" },
    { url: `${origin}/termos`, date: "2026-08-27", frequency: "yearly", priority: "0.4" },
    { url: `${origin}/reembolsos-cancelamentos`, date: "2026-08-29", frequency: "yearly", priority: "0.4" },
    { url: `${origin}/assine`, date: "2026-08-27", frequency: "monthly", priority: "0.6" },
  ];

  const urls = entries.map((entry) => (
    `<url><loc>${escapeXml(entry.url)}</loc><lastmod>${entry.date}</lastmod><changefreq>${entry.frequency}</changefreq><priority>${entry.priority}</priority></url>`
  )).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
}
