import { getAdsensePublisherId } from "@/lib/adsense/config";

export function GET() {
  const publisherId = getAdsensePublisherId();
  if (!publisherId) {
    return new Response("AdSense ainda não ativado.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }
  return new Response(`google.com, ${publisherId.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

