export function OwnerPreviewAd({ placement }: { placement: "feed" | "article" }) {
  return <aside className={"owner-preview-ad owner-preview-ad-" + placement} aria-label="Espaço publicitário ilustrativo">
    <span>PRÉVIA · PUBLICIDADE</span><strong>Aqui aparece um anúncio</strong>
    <p>Espaço ilustrativo. Não gera impressão, receita nem solicitação ao Google.</p>
  </aside>;
}
