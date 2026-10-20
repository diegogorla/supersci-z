import { permanentRedirect } from "next/navigation";
import { localizedPath, resolveLocale } from "@/lib/seo/locales";
export const dynamic = "force-dynamic";
type MagazineQuery = { searchParams: Promise<{ lang?: string }> };
async function MagazineRedirect({ searchParams }: MagazineQuery) {
  permanentRedirect(localizedPath("/", resolveLocale((await searchParams).lang)));
  return null;
}
export default function RevistaPage({ searchParams }: MagazineQuery) {
  return <MagazineRedirect searchParams={searchParams} />;
}
