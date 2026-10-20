import { UserRound } from "lucide-react";
import { ACCESS_TIER_LABELS } from "@/lib/account/plans";
import type { ViewerSummary } from "@/lib/account/viewer";

// Private links use full document navigation to unload analytics before authentication.
export function AccountLink({ viewer, loginNext, className = "account-link" }: { viewer: ViewerSummary | null; loginNext: string; className?: string }) {
  if (!viewer) {
    return <a className={className} href={`/entrar?next=${encodeURIComponent(loginNext)}`}><UserRound size={15} /> Entrar</a>;
  }
  const label = ACCESS_TIER_LABELS[viewer.accessTier];
  return (
    <a className={`${className} signed-account-link`} href="/conta" title={`Minha conta — Plano ${label}`}>
      <UserRound size={15} />
      <span>Minha conta</span>
      <small>{label}</small>
    </a>
  );
}
