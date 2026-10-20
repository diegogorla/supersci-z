import "server-only";
import type { ComponentProps } from "react";
import { LegalShell } from "./legal-shell";

export function PublicLegalShell(props: ComponentProps<typeof LegalShell>) {
  return <LegalShell {...props} />;
}
