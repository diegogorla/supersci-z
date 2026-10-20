import { getOwnerPreview, isVerifiedPreviewOwner } from "@/lib/owner-preview/server";
import { OwnerPreviewControls } from "./owner-preview-controls";

export async function OwnerPreviewAccount() {
  if (!(await isVerifiedPreviewOwner())) return null;
  const preview = await getOwnerPreview();
  return preview
    ? <p className="owner-preview-account-note"><strong>Você está na sua conta real.</strong> Os dados, permissões e ações abaixo continuam sendo os do proprietário. A simulação se aplica à apresentação da revista e dos artigos.</p>
    : <OwnerPreviewControls profile={null} />;
}
