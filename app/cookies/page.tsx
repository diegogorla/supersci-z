import type { Metadata } from "next";
import { CookiePreferencesButton } from "../cookie-consent";
import { PublicLegalShell as LegalShell } from "../public-legal-shell";
import { isAdsenseRuntimeReady } from "@/lib/adsense/config";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { isMembershipInfrastructureReady, isMembershipRuntimeReady } from "@/lib/supabase/server-config";

export const metadata: Metadata = { title: "Política de Cookies | SUPER SCI-Z", description: "Categorias de armazenamento e preferências da SUPER SCI-Z.", alternates: { canonical: "/cookies" } };

export default function CookiesPage() {
  const advertisingActive = isAdsenseRuntimeReady();
  const readingMeterActive = isMembershipRuntimeReady();
  const readerIdentityActive = isMembershipInfrastructureReady() && getPaddleEnvironment() === "live";
  const analyticsActive = true;
  return (
    <LegalShell updatedDate="27 de setembro de 2026" eyebrow="LEGAL / COOKIES" title="Política de Cookies" intro="O que armazenamos no navegador e como você mantém o controle.">
      <section><h2>1. O que chamamos de cookies</h2><p>Nesta política, “cookies” inclui cookies HTTP e tecnologias semelhantes, como armazenamento local do navegador. Elas podem lembrar uma preferência, apoiar segurança, medir uso ou permitir publicidade.</p></section>
      <section><h2>2. Situação atual</h2><p>A SUPER SCI-Z usa armazenamento local para lembrar idioma e sua escolha de privacidade. Cookies HTTP essenciais mantêm a sessão segura do leitor cadastrado. {readerIdentityActive ? (readingMeterActive ? "Um identificador aleatório assinado reconhece este navegador e mede a cota de leitura sem cadastro." : "Um identificador aleatório assinado já reconhece este navegador; a contagem da cota começa somente quando a restrição de leitura for ativada.") : "O identificador de cota sem cadastro só entra em uso quando a infraestrutura de leitura estiver pronta."} O Metricool mede visitas somente após autorização; segundo o fornecedor, o rastreador não grava cookies e usa o endereço IP para estimar o país e identificar a página acessada. O Google Analytics também poderá medir audiência após autorização, quando configurado. {advertisingActive ? "A publicidade pode operar apenas nas páginas editoriais elegíveis e conforme a plataforma certificada de consentimento do Google." : "A publicidade permanece desligada."}</p></section>
      <section><h2>3. Categorias</h2><div className="cookie-table"><div><strong>Essenciais</strong><span>Sempre ativos</span><p>Sessão, proteção contra fraude, cota de leitura e registro da escolha de privacidade. O identificador de cota não contém nome, e-mail ou telefone.</p></div><div><strong>Preferências</strong><span>Funcionais</span><p>Idioma escolhido e apresentação da experiência editorial.</p></div><div><strong>Analytics</strong><span>{analyticsActive ? "Mediante consentimento" : "Desligado"}</span><p>O Metricool registra páginas visitadas e processa o IP para estimar o país, sem cookies segundo o fornecedor. O Google Analytics também pode operar após consentimento quando configurado.</p></div><div><strong>Publicidade</strong><span>{advertisingActive ? "Ativa nas páginas elegíveis" : "Desligada"}</span><p>{advertisingActive ? "Seleção, entrega e medição de anúncios conforme o plano do leitor e as escolhas administradas pela CMP certificada." : "Seleção, entrega e medição de anúncios dependem do AdSense e da CMP certificada."}</p></div></div></section>
      <section><h2>4. Como mudar sua escolha</h2><p>Use o botão abaixo para reabrir o painel. Bloqueios definidos diretamente no navegador também podem limitar o armazenamento.</p><CookiePreferencesButton className="legal-action" /></section>
      <section><h2>5. Armazenamentos previstos</h2><p><strong>ssz_reader_v1:</strong> cookie HttpOnly, Secure e SameSite=Lax, usado apenas para cota sem cadastro, com duração máxima de 400 dias. <strong>Cookies do Supabase Auth:</strong> mantêm e renovam a sessão do leitor cadastrado. <strong>super-sciz-lang e supersciz-consent-v2:</strong> preferências locais de idioma e privacidade. <strong>_ga e _ga_&#123;ID&#125;:</strong> cookies do Google Analytics criados somente após consentimento, quando configurado. O Metricool não utiliza cookies, segundo o fornecedor; a medição só começa após consentimento.</p></section>
      <section><h2>6. Consentimento internacional</h2><p>{advertisingActive ? "Visitantes do Espaço Econômico Europeu, Reino Unido, Suíça e outras regiões cobertas recebem a mensagem aplicável por meio da plataforma de gestão de consentimento certificada pelo Google." : "Antes de qualquer ativação do AdSense, a SUPER SCI-Z exige uma plataforma de gestão de consentimento certificada pelo Google para as regiões em que ela é necessária."}</p></section>
      <section><h2>7. Contato</h2><p>Solicitações sobre cookies e privacidade: <a href="mailto:adm@supersci-z.com">adm@supersci-z.com</a>.</p></section>
    </LegalShell>
  );
}
