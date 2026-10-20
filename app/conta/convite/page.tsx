import type { Metadata } from "next";
import { BrandWordmark } from "../../brand-mark";
import { redirect } from "next/navigation";
import { InviteAcceptance } from "./invite-acceptance";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Convite Cosmos | SUPER SCI-Z", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  if (!isSupabaseConfigured()) redirect("/entrar?erro=configuracao");
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/entrar?next=${encodeURIComponent(`/conta/convite?token=${token}`)}`);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <BrandWordmark href="/" />
        <span className="editorial-label">CONVITE COSMOS</span>
        <h1>Compartilhe o universo.</h1>
        <p>Ao aceitar, esta conta recebe um perfil equivalente ao Fundador: leitura ilimitada, comentários e experiência sem anúncios. A prioridade editorial continua exclusiva do titular Cosmos. O convite só funciona para o e-mail indicado pelo titular.</p>
        <InviteAcceptance token={token} />
      </section>
    </main>
  );
}
