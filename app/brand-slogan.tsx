import type { Locale } from "./content-public";

export function BrandSlogan({ locale }: { locale: Locale }) {
  if (locale === "pt") return <>O Superlativo de Ciência</>;

  return <>Science to Supersize Understanding</>;
}
