import type { Metadata } from "next";
import { PublicLegalShell as LegalShell } from "../public-legal-shell";
import { ContactEmailActions } from "./contact-email-actions";

export const metadata: Metadata = { title: "Contato | SUPER SCI-Z", description: "Canais editoriais, administrativos e de privacidade da SUPER SCI-Z.", alternates: { canonical: "/contato" } };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ assunto?: string }> }) {
  const subject = (await searchParams).assunto === "assinatura" ? "Assinatura SUPER SCI-Z" : "Contato SUPER SCI-Z";
  return (
    <LegalShell eyebrow="INSTITUCIONAL / CONTATO" title="Fale com a redação." intro="Um canal direto para leitores, fontes, pesquisadores e parceiros.">
      <section><h2>Contato geral</h2><p>Escreva para <a href="mailto:adm@supersci-z.com">adm@supersci-z.com</a>. Inclua um assunto claro para facilitar o encaminhamento.</p></section>
      <section><h2>Correções e pautas</h2><p>Para sugerir uma correção, informe o endereço da matéria e descreva o ponto com a fonte que sustenta a observação. Propostas de pauta devem indicar relevância, contexto e referências verificáveis.</p></section>
      <section><h2>Privacidade</h2><p>Pedidos relacionados a dados pessoais também são recebidos em <a href="mailto:adm@supersci-z.com?subject=Privacidade%20SUPER%20SCI-Z">adm@supersci-z.com</a>, preferencialmente com “Privacidade” no assunto.</p></section>
      <section><h2>Parcerias e publicidade</h2><p>Parcerias comerciais são identificadas de forma clara e não compram influência sobre conclusões editoriais. Propostas podem usar o mesmo canal administrativo.</p></section>
      <ContactEmailActions subject={subject} />
    </LegalShell>
  );
}
