import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaddleEnvironment } from "@/lib/paddle/config";

export const metadata: Metadata = { title: "Confirmação da assinatura | SUPER SCI-Z", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage() {
  let confirmed = false;
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
    if (userId) {
      const { data: subscription } = await supabase.from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "paddle")
        .eq("provider_environment", getPaddleEnvironment())
        .in("status", ["trialing", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      confirmed = Boolean(subscription?.id);
    }
  }

  return <main className="auth-page"><section className="auth-card checkout-success">{confirmed ? <CheckCircle2 size={46} /> : <Clock3 size={46} />}<span className="editorial-label">{confirmed ? "ASSINATURA CONFIRMADA" : "CONFIRMAÇÃO EM PROCESSAMENTO"}</span><h1>{confirmed ? "Bem-vindo à próxima órbita." : "O checkout foi concluído."}</h1><p>{confirmed ? "O evento assinado do Paddle já foi validado e o benefício está registrado na sua conta." : "A SUPER SCI-Z ainda aguarda o evento assinado do Paddle. Nenhum plano é liberado apenas por esta página; consulte sua conta para acompanhar a confirmação."}</p><Link className="legal-action" href="/conta">Abrir minha conta</Link><Link className="back-link" href="/">Voltar à revista</Link></section></main>;
}
