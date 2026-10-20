import type { Metadata } from "next";
import Link from "next/link";
import { PublicLegalShell as LegalShell } from "../public-legal-shell";

export const metadata: Metadata = {
  title: "Reembolsos e Cancelamentos | SUPER SCI-Z",
  description: "Regras e canais para cancelamento de assinaturas, direito de arrependimento e pedidos de reembolso.",
  alternates: { canonical: "/reembolsos-cancelamentos" },
};

export default function RefundsAndCancellationsPage() {
  return (
    <LegalShell updatedDate="20 de setembro de 2026" eyebrow="LEGAL / ASSINATURAS" title="Reembolsos e Cancelamentos" intro="Como interromper uma renovação e solicitar a análise de uma cobrança.">
      <section><h2>1. Quem processa o pagamento</h2><p>O checkout e a cobrança dos planos são processados pelo Paddle, comerciante responsável pela transação. A SUPER SCI-Z não armazena o número completo do cartão. Recibos, impostos e dados da compra são apresentados pelo Paddle.</p></section>
      <section><h2>2. Cancelamento de planos recorrentes</h2><p>Você poderá cancelar a renovação pela área da conta da SUPER SCI-Z ou pelo portal do Paddle. O cancelamento comum impede a próxima renovação e, salvo determinação legal ou informação diferente exibida no checkout, mantém o acesso até o fim do período já pago.</p><p>Durante um período gratuito, cancele antes da data indicada no checkout para evitar a primeira cobrança. A confirmação de cancelamento deve ser guardada pelo leitor.</p></section>
      <section><h2>3. Pagamentos sem renovação</h2><p>O plano anual por Pix e o acesso vitalício são compras de pagamento único e não geram renovação automática. Por isso, não há assinatura futura a cancelar, mas permanecem válidos os direitos de arrependimento, reembolso ou correção de cobrança previstos nesta política e na legislação aplicável.</p></section>
      <section><h2>4. Direito de arrependimento</h2><p>Para consumidores no Brasil, compras realizadas fora do estabelecimento comercial podem ser canceladas no prazo legal de sete dias contado da assinatura do contrato ou do recebimento do serviço, nos termos do artigo 49 do Código de Defesa do Consumidor. Direitos obrigatórios mais favoráveis aplicáveis em outra jurisdição também serão respeitados.</p></section>
      <section><h2>5. Como solicitar reembolso</h2><p>Envie o pedido para <a href="mailto:adm@supersci-z.com?subject=Reembolso%20SUPER%20SCI-Z">adm@supersci-z.com</a>, informando o e-mail usado na compra, a data, o plano e o motivo, sem enviar número completo de cartão, senha ou documento de identidade. O comprador também pode usar o suporte de pedidos do Paddle indicado no recibo.</p><p>Pedidos por cobrança duplicada, acesso não entregue, fraude ou erro técnico serão analisados de acordo com a legislação, o estado da transação e as regras do processador. Quando aprovado, o reembolso será feito pelo mesmo fluxo de pagamento sempre que possível; prazo de crédito e conversão cambial podem depender do banco ou do meio utilizado.</p></section>
      <section><h2>6. Efeito sobre o acesso</h2><p>Um reembolso integral pode encerrar o benefício correspondente. Reembolsos parciais, quando admitidos, serão explicados antes de sua conclusão. O exercício de direitos legais não limita o contato com órgãos de defesa do consumidor ou outros meios legítimos de solução.</p></section>
      <section><h2>7. Contato e documentos relacionados</h2><p>SUPER SCI-Z é a marca editorial de propriedade e sob responsabilidade da empresa Mateus de Aquino ME. Consulte também os <Link href="/termos">Termos de Uso</Link>, a <Link href="/privacidade">Política de Privacidade</Link> e a página de <Link href="/contato">Contato</Link>.</p></section>
      <aside className="legal-note"><strong>Última atualização:</strong> 20 de setembro de 2026.</aside>
    </LegalShell>
  );
}
