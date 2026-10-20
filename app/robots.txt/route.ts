const origin = "https://supersci-z.com";

export async function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${origin}/sitemap.xml`,
    `Sitemap: ${origin}/news-sitemap.xml`,
    `Host: ${origin}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
