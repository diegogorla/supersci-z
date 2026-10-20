import type { Locale } from "@/app/content-public";

export const localeCodes: readonly Locale[] = ["pt", "en", "es", "zh", "hi", "ja", "ru"];

export const htmlLanguage: Record<Locale, string> = { pt: "pt-BR", en: "en", es: "es", zh: "zh-CN", hi: "hi", ja: "ja", ru: "ru" };
const hreflang: Record<Locale, string> = { pt: "pt-BR", en: "en", es: "es", zh: "zh-CN", hi: "hi", ja: "ja", ru: "ru" };

export function resolveLocale(value: string | null | undefined): Locale {
  return localeCodes.includes(value as Locale) ? value as Locale : "pt";
}

export function localizedPath(path: string, locale: Locale) {
  return locale === "pt" ? path : `${path}?lang=${locale}`;
}

export function languageAlternates(path: string) {
  return { ...Object.fromEntries(localeCodes.map((locale) => [hreflang[locale], localizedPath(path, locale)])), "x-default": path };
}

export const landingSeo: Record<Locale, { title: string; description: string }> = {
  pt: { title: "SUPER SCI-Z | Ciência, IA, física e cosmologia", description: "Revista científica sobre inteligência artificial, neurociência, linguística, filosofia, psicologia, física quântica, astronomia e cosmologia." },
  en: { title: "SUPER SCI-Z | Science, AI, physics and cosmology", description: "Science magazine covering artificial intelligence, neuroscience, linguistics, philosophy, psychology, quantum physics, astronomy and cosmology." },
  es: { title: "SUPER SCI-Z | Ciencia, IA, física y cosmología", description: "Revista científica sobre inteligencia artificial, neurociencia, lingüística, filosofía, psicología, física cuántica, astronomía y cosmología." },
  zh: { title: "SUPER SCI-Z｜科学、人工智能、物理学与宇宙学", description: "涵盖人工智能、神经科学、语言学、哲学、心理学、量子物理、天文学与宇宙学的科学杂志。" },
  hi: { title: "SUPER SCI-Z | विज्ञान, एआई, भौतिकी और ब्रह्मांड विज्ञान", description: "कृत्रिम बुद्धिमत्ता, तंत्रिका विज्ञान, भाषाविज्ञान, दर्शन, मनोविज्ञान, क्वांटम भौतिकी, खगोल विज्ञान और ब्रह्मांड विज्ञान की वैज्ञानिक पत्रिका।" },
  ja: { title: "SUPER SCI-Z｜科学・AI・物理学・宇宙論", description: "人工知能、神経科学、言語学、哲学、心理学、量子物理学、天文学、宇宙論を扱う科学誌。" },
  ru: { title: "SUPER SCI-Z | Наука, ИИ, физика и космология", description: "Научный журнал об искусственном интеллекте, нейронауках, лингвистике, философии, психологии, квантовой физике, астрономии и космологии." },
};

export const magazineSeo: Record<Locale, { title: string; description: string }> = {
  pt: { title: "Notícias de ciência, IA, física e cosmologia | SUPER SCI-Z", description: "Notícias científicas e análises sobre inteligência artificial, cérebro, linguagem, sociedade, física, astronomia e universo." },
  en: { title: "Science, AI, physics and cosmology news | SUPER SCI-Z", description: "Science news and analysis on artificial intelligence, the brain, language, society, physics, astronomy and the universe." },
  es: { title: "Noticias de ciencia, IA, física y cosmología | SUPER SCI-Z", description: "Noticias científicas y análisis sobre inteligencia artificial, cerebro, lenguaje, sociedad, física, astronomía y universo." },
  zh: { title: "科学、人工智能、物理学与宇宙学新闻｜SUPER SCI-Z", description: "关于人工智能、大脑、语言、社会、物理学、天文学与宇宙的科学新闻和深度分析。" },
  hi: { title: "विज्ञान, एआई, भौतिकी और ब्रह्मांड समाचार | SUPER SCI-Z", description: "कृत्रिम बुद्धिमत्ता, मस्तिष्क, भाषा, समाज, भौतिकी, खगोल विज्ञान और ब्रह्मांड पर वैज्ञानिक समाचार और विश्लेषण।" },
  ja: { title: "科学・AI・物理学・宇宙論ニュース｜SUPER SCI-Z", description: "人工知能、脳、言語、社会、物理学、天文学、宇宙に関する科学ニュースと解説。" },
  ru: { title: "Новости науки, ИИ, физики и космологии | SUPER SCI-Z", description: "Научные новости и анализ об искусственном интеллекте, мозге, языке, обществе, физике, астрономии и Вселенной." },
};

export const topicSlugs = ["linguistica", "mente-psicologia", "filosofia-sociedade", "fisica", "cosmologia"] as const;
export type TopicSlug = (typeof topicSlugs)[number];

export const topics: Record<TopicSlug, { key: string; labels: Record<Locale, string>; searchTerms: string[] }> = {
  linguistica: { key: "language", labels: { pt: "Linguística", en: "Linguistics", es: "Lingüística", zh: "语言学", hi: "भाषाविज्ञान", ja: "言語学", ru: "Лингвистика" }, searchTerms: ["linguística", "linguagem", "fala", "fonemas", "inteligência artificial"] },
  "mente-psicologia": { key: "mind", labels: { pt: "Mente e Psicologia", en: "Mind and Psychology", es: "Mente y Psicología", zh: "心智与心理学", hi: "मन और मनोविज्ञान", ja: "心と心理学", ru: "Разум и психология" }, searchTerms: ["psicologia", "mente", "cérebro", "neurociência", "ciências cognitivas"] },
  "filosofia-sociedade": { key: "society", labels: { pt: "Filosofia e Sociedade", en: "Philosophy and Society", es: "Filosofía y Sociedad", zh: "哲学与社会", hi: "दर्शन और समाज", ja: "哲学と社会", ru: "Философия и общество" }, searchTerms: ["filosofia", "sociologia", "sociedade", "ética", "filosofia da ciência"] },
  fisica: { key: "physics", labels: { pt: "Física", en: "Physics", es: "Física", zh: "物理学", hi: "भौतिकी", ja: "物理学", ru: "Физика" }, searchTerms: ["física", "física quântica", "matéria", "energia", "universo"] },
  cosmologia: { key: "cosmos", labels: { pt: "Cosmologia", en: "Cosmology", es: "Cosmología", zh: "宇宙学", hi: "ब्रह्मांड विज्ञान", ja: "宇宙論", ru: "Космология" }, searchTerms: ["cosmologia", "astronomia", "universo", "matéria escura", "telescópios espaciais"] },
};

const topicDescriptionTemplate: Record<Locale, (topic: string) => string> = {
  pt: (topic) => `${topic}: notícias, pesquisas e análises científicas com fontes primárias, contexto histórico e explicações acessíveis.`,
  en: (topic) => `${topic}: science news, research and evidence-based analysis with primary sources, historical context and clear explanations.`,
  es: (topic) => `${topic}: noticias, investigaciones y análisis científicos con fuentes primarias, contexto histórico y explicaciones claras.`,
  zh: (topic) => `${topic}：基于第一手资料的科学新闻、研究与分析，并提供历史背景和清晰解释。`,
  hi: (topic) => `${topic}: प्राथमिक स्रोतों, ऐतिहासिक संदर्भ और स्पष्ट व्याख्या के साथ वैज्ञानिक समाचार, शोध और विश्लेषण।`,
  ja: (topic) => `${topic}：一次資料、歴史的文脈、明快な解説に基づく科学ニュース・研究・分析。`,
  ru: (topic) => `${topic}: научные новости, исследования и анализ с первичными источниками, историческим контекстом и ясными объяснениями.`,
};

export function topicSeo(slug: TopicSlug, locale: Locale) {
  const label = topics[slug].labels[locale];
  return { title: `${label} | SUPER SCI-Z`, description: topicDescriptionTemplate[locale](label) };
}
