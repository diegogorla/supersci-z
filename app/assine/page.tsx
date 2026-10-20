import { getOwnerPreview } from "@/lib/owner-preview/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { LegalShell } from "../legal-shell";
import { CheckoutButton } from "./checkout-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPaddleCheckoutReady } from "@/lib/paddle/config";
import { isPaddleLiveTestRuntimeReady } from "@/lib/paddle/live-test";
import { safeReturnPath } from "@/lib/security/return-path";

export const metadata: Metadata = { title: "Assine | SUPER SCI-Z", description: "Conheça os planos Fundador, Cosmos e Vitalício da SUPER SCI-Z.", alternates: { canonical: "/assine" } };

const founder = ["Leitura ilimitada em sete idiomas", "Sem anúncios", "Comentários com conta verificada e moderação", "Arquivo e dossiês interdisciplinares"];
const cosmos = ["Leitura ilimitada e nenhum anúncio", "Três acessos simultâneos no total", "Até dois perfis convidados com benefícios Fundador e sem anúncios", "Perguntas do titular identificadas como prioridade Cosmos"];
const lifetime = ["Pagamento único", "Acesso individual enquanto o serviço existir", "Sem anúncios", "Oferta limitada de lançamento"];

export const dynamic = "force-dynamic";

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ live?: string; next?: string }> }) {
  const query = await searchParams;
  const preview = await getOwnerPreview();
  const liveRequested = query.live === "1";
  let signedIn = false;
  let userEmail: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user?.id);
    userEmail = data.user?.email ?? null;
  }
  const runtimeReady = isMembershipRuntimeReady();
  const liveTestReady = !preview && liveRequested && signedIn && isPaddleLiveTestRuntimeReady(userEmail);
  const ready = (plan: Parameters<typeof isPaddleCheckoutReady>[0]) => !preview && (runtimeReady || liveTestReady) && isPaddleCheckoutReady(plan);
  const loginPath = `/entrar?next=${encodeURIComponent(safeReturnPath(query.next ?? "/"))}`;

  return (
    <LegalShell pageClassName="subscription-page" eyebrow="ASSINATURAS SUPER SCI-Z" title="Escolha seu plano e ganhe 7 dias de acesso total 100% gratuito!" showUpdatedDate={false} intro={<>Ou faça seu <a href={loginPath}><strong>login</strong></a> para acessar mais 2 matérias imediatamente!<sup><a href="#acesso-gratuito" aria-label="Condições das leituras gratuitas">*</a></sup></>}>
      {preview && <p className="legal-note"><strong>Visualização demonstrativa.</strong> Para abrir um checkout, volte ao modo proprietário na barra acima.</p>}
      <div className="subscription-grid subscription-grid-three">
        <article><span>SCI-Z FUNDADOR</span><h2>Essencial</h2><strong>R$7,90/mês · R$79/ano</strong><ul>{founder.map((benefit) => <li key={benefit}><Check size={17} />{benefit}</li>)}</ul><p>O Paddle exibirá o preço localizado, a moeda e os impostos aplicáveis antes da confirmação. Pix anual custa R$79 no Brasil e não tem renovação automática.</p><CheckoutButton plan="founder_monthly" ready={ready("founder_monthly")} signedIn={signedIn}>Começar plano mensal</CheckoutButton><CheckoutButton plan="founder_annual" ready={ready("founder_annual")} signedIn={signedIn}>Anual com renovação</CheckoutButton><CheckoutButton plan="founder_annual_pix" ready={ready("founder_annual_pix")} signedIn={signedIn}>Anual por Pix · pagamento único</CheckoutButton></article>
        <article className="subscription-featured"><span>SCI-Z COSMOS</span><h2>Titular sem anúncios</h2><strong>R$19,90/mês · R$199/ano</strong><ul>{cosmos.map((benefit) => <li key={benefit}><Check size={17} />{benefit}</li>)}</ul><p>Cada convite passa a reservar uma das três vagas somente quando é aceito. Se a capacidade do titular diminuir, será substituído o dispositivo dele cujo último acesso ocorreu há mais tempo. Fora do Brasil, o checkout exibirá preço, moeda e impostos antes da confirmação.</p><CheckoutButton plan="cosmos_monthly" ready={ready("cosmos_monthly")} signedIn={signedIn}>Começar Cosmos mensal</CheckoutButton><CheckoutButton plan="cosmos_annual" ready={ready("cosmos_annual")} signedIn={signedIn}>Escolher Cosmos anual</CheckoutButton></article>
        <article><span>FUNDADOR VITALÍCIO</span><h2>Pagamento único</h2><strong>R$399</strong><ul>{lifetime.map((benefit) => <li key={benefit}><Check size={17} />{benefit}</li>)}</ul><p>Fora do Brasil, o checkout exibirá o preço localizado. Acesso sem anúncios como no Fundador; disponibilidade limitada no lançamento.</p><CheckoutButton plan="lifetime" ready={ready("lifetime")} signedIn={signedIn}>Garantir acesso vitalício</CheckoutButton></article>
      </div>
      <section className="conversion-intro"><span><Sparkles /> 7 dias nos planos recorrentes</span><h2>Leia tudo antes de decidir.</h2><p>Os planos mensais e anuais com renovação oferecem sete dias de acesso total gratuito, sem cobrança imediata. Após o teste, começa a cobrança do plano escolhido; cancele a renovação pela sua conta antes dessa data se não quiser continuar. Pix anual e acesso vitalício são pagamentos únicos, sem período de teste ou renovação.</p><div className="trust-row"><span><ShieldCheck /> Pagamento protegido pelo Paddle</span><span>Cancelamento pela sua conta</span><span>Paddle como comerciante responsável</span></div></section>
      <section id="acesso-gratuito"><h2>* Seu acesso gratuito continua</h2><p>Visitantes sem cadastro leem 4 matérias a cada 30 dias. Ao entrar ou criar sua conta, a cota inicial passa a 6 matérias: 2 a mais que a cota de visitante. Essa diferença vale para quem ainda não utilizou a cota de cadastro; fazer login novamente não renova créditos já consumidos.</p><p>Depois de utilizar a cota inicial, leitores cadastrados recebem 1 novo crédito a cada 7 dias, até 4 créditos adicionais no mesmo ciclo. A assinatura oferece leitura ilimitada.</p></section>
      {!runtimeReady && !liveTestReady && <p className="legal-note"><strong>Assinaturas temporariamente indisponíveis.</strong> Nenhuma cobrança será iniciada enquanto o checkout seguro estiver fora de operação. Tente novamente mais tarde ou fale com a SUPER SCI-Z.</p>}
      {liveTestReady && <div className="legal-note"><strong>Validação controlada Live:</strong> este checkout processa uma cobrança real e está liberado somente para a conta autorizada. Confirme plano, moeda, impostos, data e meio de pagamento antes de concluir. Use apenas um meio de pagamento real sob seu controle e guarde o recibo para testar portal, cancelamento e eventual reembolso.</div>}
      <section><h2>Preferências sob seu controle</h2><p>Na área da conta, cada leitor escolhe o tema claro ou escuro e registra separadamente se deseja receber atualizações por e-mail, WhatsApp, Telegram ou SMS. Registrar uma preferência não inicia envios por um canal que ainda não esteja disponível.</p></section>
      <section><h2>Preço transparente</h2><p>O Paddle opera como comerciante responsável, calcula impostos aplicáveis e processa os meios disponíveis para cada país. O valor final e a data da renovação sempre aparecem antes da confirmação. A SUPER SCI-Z não recebe nem armazena o número completo do cartão.</p><Link className="legal-action" href="/contato?assunto=assinatura">Falar com a SUPER SCI-Z</Link></section>
    </LegalShell>
  );
}
