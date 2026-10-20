import { getPublicArticles } from "@/lib/content/public";

const origin = "https://supersci-z.com";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[char]!);
}

export async function GET() {
  const articles = await getPublicArticles();
  const items = [...articles].sort((a, b) => b.date.localeCompare(a.date)).map((article) => {
    const copy = article.copy.pt;
    const url = `${origin}/artigo/${article.slug}`;
    return `<item><title>${escapeXml(copy.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(`${article.date}T12:00:00Z`).toUTCString()}</pubDate><category>${escapeXml(copy.category)}</category><description>${escapeXml(copy.dek)}</description></item>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>SUPER SCI-Z</title><link>${origin}/</link><description>Ciência, ideias e futuros: linguagem, mente, sociedade, física e cosmologia.</description><language>pt-BR</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
}
