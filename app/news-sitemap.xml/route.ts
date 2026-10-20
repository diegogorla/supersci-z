import { getPublicArticles } from "@/lib/content/public";

const origin = "https://supersci-z.com";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[char]!);
}

export async function GET() {
  const articles = await getPublicArticles();
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const recent = articles.filter((article) => article.isDaily && new Date(`${article.date}T12:00:00Z`).getTime() >= cutoff);
  const urls = recent.map((article) => {
    const copy = article.copy.pt;
    return `<url><loc>${origin}/artigo/${article.slug}</loc><news:news><news:publication><news:name>SUPER SCI-Z</news:name><news:language>pt</news:language></news:publication><news:publication_date>${article.date}</news:publication_date><news:title>${escapeXml(copy.title)}</news:title></news:news></url>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls}</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
}
