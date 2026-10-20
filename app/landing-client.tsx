import type { Locale } from "./content-public";
const introduction: Record<Locale, { edition: string; statement: string; subscribe: string }> = {
  pt: { edition: "REVISTA CIENTÍFICA INTERNACIONAL", statement: "Ciência de verdade na sua língua.", subscribe: "Escolher meu plano" },
  en: { edition: "INTERNATIONAL SCIENCE MAGAZINE", statement: "Real science in your language.", subscribe: "Choose my plan" },
  es: { edition: "REVISTA CIENTÍFICA INTERNACIONAL", statement: "Ciencia de verdad en tu idioma.", subscribe: "Elegir mi plan" },
  zh: { edition: "国际科学杂志", statement: "用你的语言，读真正的科学。", subscribe: "选择订阅方案" },
  hi: { edition: "अंतरराष्ट्रीय विज्ञान पत्रिका", statement: "आपकी भाषा में वास्तविक विज्ञान।", subscribe: "अपनी योजना चुनें" },
  ja: { edition: "国際科学誌", statement: "あなたの言葉で、本物の科学を。", subscribe: "購読プランを選ぶ" },
  ru: { edition: "МЕЖДУНАРОДНЫЙ НАУЧНЫЙ ЖУРНАЛ", statement: "Настоящая наука на вашем языке.", subscribe: "Выбрать подписку" },
};
export default function LandingIntroduction({ locale, subscriptionsLive }: { locale: Locale; subscriptionsLive: boolean }) {
  const copy = introduction[locale];
  return <section className="magazine-intro" aria-label={copy.edition}>
    <div><span className="magazine-intro-kicker">{copy.edition}</span><p>{copy.statement}</p></div>
    {subscriptionsLive && <a className="magazine-subscribe" href="/assine">{copy.subscribe}<span aria-hidden="true">↗</span></a>}
  </section>;
}
