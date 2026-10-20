export type Locale = "pt" | "en" | "es" | "zh" | "hi" | "ja" | "ru";

export const locales = [
  {
    "code": "pt",
    "label": "Português"
  },
  {
    "code": "en",
    "label": "English"
  },
  {
    "code": "es",
    "label": "Español"
  },
  {
    "code": "zh",
    "label": "中文"
  },
  {
    "code": "hi",
    "label": "हिन्दी"
  },
  {
    "code": "ja",
    "label": "日本語"
  },
  {
    "code": "ru",
    "label": "Русский"
  }
] as const satisfies ReadonlyArray<{ code: Locale; label: string; dir?: "rtl" }>;

export type ArticlePublicCopy = { category: string; title: string; dek: string };
export type PublicArticle = { slug: string; date: string; readMinutes: number; image: string | null; imageAlt: string | null; imageCredit: string | null; imageCreditUrl: string | null; sourceName: string; sourceUrl: string; isDaily: boolean; topics: string[]; copy: Record<Locale, ArticlePublicCopy> };

export const ui: Record<Locale, Record<string, string>> = {
  "pt": {
    "daily": "EDIÇÃO DIÁRIA",
    "updated": "Atualizado em 27 ago. 2026",
    "latest": "Últimos Destaques",
    "latestSub": "Notícias e análises atualizadas diariamente a partir de fontes científicas.",
    "dossiers": "Dossiês SUPER SCI-Z",
    "dossiersSub": "Ensaios originados das perguntas, pesquisas e teses que atravessam este projeto.",
    "all": "Tudo",
    "language": "Linguística",
    "mind": "Mente & Psicologia",
    "society": "Filosofia & Sociedade",
    "physics": "Física",
    "cosmos": "Cosmologia",
    "about": "Quem somos",
    "read": "Ler matéria",
    "min": "min",
    "method": "Nosso método",
    "methodText": "Ciência de verdade na sua língua.",
    "archive": "Índice interdisciplinar",
    "languageLabel": "Idioma",
    "back": "Voltar ao índice",
    "keyPoints": "Pontos essenciais",
    "sources": "Fonte principal",
    "editorial": "Análise editorial SUPER SCI-Z",
    "criticalReading": "Leitura crítica",
    "imageCredit": "Imagem",
    "nav": "Navegação principal",
    "footer": "SUPER SCI-Z — linguagem, matéria, sociedade e o desconhecido."
  },
  "en": {
    "daily": "DAILY EDITION",
    "updated": "Updated 27 Aug 2026",
    "latest": "Latest Highlights",
    "latestSub": "News and analysis updated daily from scientific sources.",
    "dossiers": "SUPER SCI-Z dossiers",
    "dossiersSub": "Essays born from the questions, research and theses that shape this project.",
    "all": "All",
    "language": "Linguistics",
    "mind": "Mind & Psychology",
    "society": "Philosophy & Society",
    "physics": "Physics",
    "cosmos": "Cosmology",
    "about": "About us",
    "read": "Read story",
    "min": "min",
    "method": "Our method",
    "methodText": "Real science in your language.",
    "archive": "Interdisciplinary index",
    "languageLabel": "Language",
    "back": "Back to index",
    "keyPoints": "Key points",
    "sources": "Primary source",
    "editorial": "SUPER SCI-Z editorial analysis",
    "criticalReading": "Critical reading",
    "imageCredit": "Image",
    "nav": "Main navigation",
    "footer": "SUPER SCI-Z — language, matter, society and the unknown."
  },
  "es": {
    "daily": "EDICIÓN DIARIA",
    "updated": "Actualizado el 27 ago. 2026",
    "latest": "Últimos destacados",
    "latestSub": "Noticias y análisis actualizados a diario a partir de fuentes científicas.",
    "dossiers": "Dosieres SUPER SCI-Z",
    "dossiersSub": "Ensayos nacidos de las preguntas, investigaciones y tesis que atraviesan este proyecto.",
    "all": "Todo",
    "language": "Lingüística",
    "mind": "Mente y Psicología",
    "society": "Filosofía y Sociedad",
    "physics": "Física",
    "cosmos": "Cosmología",
    "about": "Quiénes somos",
    "read": "Leer artículo",
    "min": "min",
    "method": "Nuestro método",
    "methodText": "Ciencia de verdad en tu idioma.",
    "archive": "Índice interdisciplinario",
    "languageLabel": "Idioma",
    "back": "Volver al índice",
    "keyPoints": "Puntos esenciales",
    "sources": "Fuente principal",
    "editorial": "Análisis editorial SUPER SCI-Z",
    "criticalReading": "Lectura crítica",
    "imageCredit": "Imagen",
    "nav": "Navegación principal",
    "footer": "SUPER SCI-Z — lenguaje, materia, sociedad y lo desconocido."
  },
  "zh": {
    "daily": "每日版",
    "updated": "更新于 2026年8月27日",
    "latest": "最新焦点",
    "latestSub": "基于科学资料的每日新闻与分析。",
    "dossiers": "SUPER SCI-Z 专题",
    "dossiersSub": "源自本项目长期问题、研究与论题的文章。",
    "all": "全部",
    "language": "语言学",
    "mind": "心智与心理学",
    "society": "哲学与社会",
    "physics": "物理学",
    "cosmos": "宇宙学",
    "about": "关于我们",
    "read": "阅读文章",
    "min": "分钟",
    "method": "我们的方法",
    "methodText": "用你的语言，读真正的科学。",
    "archive": "跨学科索引",
    "languageLabel": "语言",
    "back": "返回索引",
    "keyPoints": "要点",
    "sources": "主要来源",
    "editorial": "SUPER SCI-Z 编辑分析",
    "criticalReading": "批判性解读",
    "imageCredit": "图片",
    "nav": "主导航",
    "footer": "SUPER SCI-Z — 语言、物质、社会与未知。"
  },
  "hi": {
    "daily": "दैनिक संस्करण",
    "updated": "27 अगस्त 2026 को अद्यतन",
    "latest": "नवीनतम प्रमुख लेख",
    "latestSub": "वैज्ञानिक स्रोतों पर आधारित समाचार और विश्लेषण, प्रतिदिन अद्यतन।",
    "dossiers": "SUPER SCI-Z डॉसियर",
    "dossiersSub": "इस परियोजना के प्रश्नों, शोध और तर्कों से जन्मे निबंध।",
    "all": "सभी",
    "language": "भाषाविज्ञान",
    "mind": "मन और मनोविज्ञान",
    "society": "दर्शन और समाज",
    "physics": "भौतिकी",
    "cosmos": "ब्रह्मांड विज्ञान",
    "about": "हमारे बारे में",
    "read": "लेख पढ़ें",
    "min": "मिनट",
    "method": "हमारी पद्धति",
    "methodText": "आपकी भाषा में वास्तविक विज्ञान।",
    "archive": "अंतर्विषयी सूचकांक",
    "languageLabel": "भाषा",
    "back": "सूचकांक पर लौटें",
    "keyPoints": "मुख्य बिंदु",
    "sources": "मुख्य स्रोत",
    "editorial": "SUPER SCI-Z संपादकीय विश्लेषण",
    "criticalReading": "आलोचनात्मक विवेचना",
    "imageCredit": "चित्र",
    "nav": "मुख्य नेविगेशन",
    "footer": "SUPER SCI-Z — भाषा, पदार्थ, समाज और अज्ञात।"
  },
  "ja": {
    "daily": "デイリー版",
    "updated": "2026年8月27日更新",
    "latest": "最新の注目記事",
    "latestSub": "科学資料に基づき、ニュースと分析を毎日更新。",
    "dossiers": "SUPER SCI-Z 特集",
    "dossiersSub": "このプロジェクトを貫く問い・研究・論点から生まれた論考。",
    "all": "すべて",
    "language": "言語学",
    "mind": "心と心理学",
    "society": "哲学と社会",
    "physics": "物理学",
    "cosmos": "宇宙論",
    "about": "私たちについて",
    "read": "記事を読む",
    "min": "分",
    "method": "私たちの方法",
    "methodText": "あなたの言葉で、本物の科学を。",
    "archive": "学際インデックス",
    "languageLabel": "言語",
    "back": "一覧へ戻る",
    "keyPoints": "要点",
    "sources": "主要資料",
    "editorial": "SUPER SCI-Z 編集分析",
    "criticalReading": "批判的検討",
    "imageCredit": "画像",
    "nav": "メインナビゲーション",
    "footer": "SUPER SCI-Z — 言語、物質、社会、そして未知。"
  },
  "ru": {
    "daily": "ЕЖЕДНЕВНЫЙ ВЫПУСК",
    "updated": "Обновлено 27 августа 2026",
    "latest": "Последние главные материалы",
    "latestSub": "Новости и аналитика, ежедневно обновляемые по научным источникам.",
    "dossiers": "Досье SUPER SCI-Z",
    "dossiersSub": "Эссе, выросшие из вопросов, исследований и тезисов этого проекта.",
    "all": "Все",
    "language": "Лингвистика",
    "mind": "Разум и психология",
    "society": "Философия и общество",
    "physics": "Физика",
    "cosmos": "Космология",
    "about": "О нас",
    "read": "Читать материал",
    "min": "мин",
    "method": "Наш метод",
    "methodText": "Настоящая наука на вашем языке.",
    "archive": "Междисциплинарный указатель",
    "languageLabel": "Язык",
    "back": "Вернуться к указателю",
    "keyPoints": "Главные выводы",
    "sources": "Основной источник",
    "editorial": "Редакционный анализ SUPER SCI-Z",
    "criticalReading": "Критический разбор",
    "imageCredit": "Изображение",
    "nav": "Основная навигация",
    "footer": "SUPER SCI-Z — язык, материя, общество и неизвестное."
  }
};

export const articles: PublicArticle[] = [
  {
    "slug": "roman-nova-janela-universo-escuro",
    "date": "2026-08-27",
    "readMinutes": 6,
    "image": "https://assets.science.nasa.gov/dynamicimage/assets/science/missions/rst/science/Roman-launchpage-banner.png?crop=faces%2Cfocalpoint&fit=crop&h=800&w=1491",
    "imageAlt": "Nancy Grace Roman Space Telescope e lançamento",
    "imageCredit": "NASA / GSFC",
    "imageCreditUrl": "https://science.nasa.gov/mission/roman-space-telescope/",
    "sourceName": "ESA — Cutting-edge infrared space telescope Roman set to launch",
    "sourceUrl": "https://www.esa.int/Science_Exploration/Space_Science/Cutting-edge_infrared_space_telescope_Roman_set_to_launch",
    "isDaily": true,
    "topics": [
      "physics",
      "cosmos"
    ],
    "copy": {
      "pt": {
        "category": "COSMOLOGIA • NOTÍCIA",
        "title": "Roman: uma nova janela para o Universo escuro",
        "dek": "O telescópio com lançamento previsto para 30 de agosto combinará imagens comparáveis às do Hubble com um campo de visão mais de 200 vezes maior."
      },
      "en": {
        "category": "COSMOLOGY • NEWS",
        "title": "Roman: a new window on the dark Universe",
        "dek": "Scheduled to launch on 30 August, the telescope will pair Hubble-quality imaging with a field of view over 200 times larger."
      },
      "es": {
        "category": "COSMOLOGÍA • NOTICIA",
        "title": "Roman: una nueva ventana al Universo oscuro",
        "dek": "Con lanzamiento previsto para el 30 de agosto, combinará imágenes comparables a las del Hubble con un campo de visión más de 200 veces mayor."
      },
      "zh": {
        "category": "宇宙学 • 新闻",
        "title": "罗曼望远镜：观察暗宇宙的新窗口",
        "dek": "计划于8月30日发射，它将把哈勃级成像与大200多倍的视场结合起来。"
      },
      "hi": {
        "category": "ब्रह्मांड विज्ञान • समाचार",
        "title": "रोमन: अंधेरे ब्रह्मांड की नई खिड़की",
        "dek": "30 अगस्त को प्रस्तावित प्रक्षेपण वाला यह दूरबीन हबल-जैसी छवि गुणवत्ता को 200 गुना से अधिक बड़े दृश्य क्षेत्र से जोड़ेगा।"
      },
      "ja": {
        "category": "宇宙論 • ニュース",
        "title": "ローマン宇宙望遠鏡：暗黒宇宙への新しい窓",
        "dek": "8月30日の打ち上げを予定し、ハッブル級の画質と200倍以上の視野を両立する。"
      },
      "ru": {
        "category": "КОСМОЛОГИЯ • НОВОСТИ",
        "title": "Roman: новое окно в тёмную Вселенную",
        "dek": "Телескоп, запуск которого намечен на 30 августа, совместит качество Hubble с полем зрения более чем в 200 раз шире."
      }
    }
  },
  {
    "slug": "como-planos-de-fala-viram-fonemas",
    "date": "2026-08-27",
    "readMinutes": 5,
    "image": "https://news.mit.edu/sites/default/files/images/202605/mit-mcgovern-brain-language.jpg",
    "imageAlt": "Rede cerebral humana relacionada à linguagem",
    "imageCredit": "MIT / McGovern Institute",
    "imageCreditUrl": "https://news.mit.edu/2026/language-development-brain-0518",
    "sourceName": "Nature Human Behaviour — How speech plans become spoken sequences",
    "sourceUrl": "https://www.nature.com/articles/s41562-026-02545-x",
    "isDaily": true,
    "topics": [
      "language",
      "mind"
    ],
    "copy": {
      "pt": {
        "category": "NEUROLINGUÍSTICA • NOTÍCIA",
        "title": "Como o cérebro transforma planos de fala em fonemas",
        "dek": "Registros intracranianos distinguem processos neurais que ligam o planejamento silábico à execução motora da fala."
      },
      "en": {
        "category": "NEUROLINGUISTICS • NEWS",
        "title": "How the brain turns speech plans into phonemes",
        "dek": "Intracranial recordings distinguish neural processes linking syllable-level planning to speech motor execution."
      },
      "es": {
        "category": "NEUROLINGÜÍSTICA • NOTICIA",
        "title": "Cómo el cerebro convierte planes de habla en fonemas",
        "dek": "Registros intracraneales distinguen procesos que conectan la planificación silábica con la ejecución motora."
      },
      "zh": {
        "category": "神经语言学 • 新闻",
        "title": "大脑如何把言语计划变成音素",
        "dek": "颅内记录区分了从音节规划到言语运动执行的神经过程。"
      },
      "hi": {
        "category": "तंत्रिका-भाषाविज्ञान • समाचार",
        "title": "मस्तिष्क वाक्-योजनाओं को ध्वनियों में कैसे बदलता है",
        "dek": "अंतःकपालीय रिकॉर्डिंग अक्षरखंडीय योजना को वाक्-गतिशील निष्पादन से जोड़ने वाली प्रक्रियाएँ अलग करती है।"
      },
      "ja": {
        "category": "神経言語学 • ニュース",
        "title": "脳は発話計画をどう音素列に変えるのか",
        "dek": "頭蓋内記録により、音節レベルの計画と発話運動を結ぶ神経過程が区別された。"
      },
      "ru": {
        "category": "НЕЙРОЛИНГВИСТИКА • НОВОСТИ",
        "title": "Как мозг превращает речевой план в последовательность фонем",
        "dek": "Внутричерепные записи различают процессы, связывающие слоговое планирование с моторным исполнением речи."
      }
    }
  },
  {
    "slug": "mente-nao-e-software-linguagem-corpo-contexto",
    "date": "2026-08-26",
    "readMinutes": 8,
    "image": "https://actu.epfl.ch/image/153977/1440x810.jpg",
    "imageAlt": "Representação digital de linguagem e redes neurais",
    "imageCredit": "EPFL / Alexander Mathis Lab",
    "imageCreditUrl": "https://www.epfl.ch/labs/alexandermathis-lab/",
    "sourceName": "Dossiê autoral — mente, cérebro, linguagem e IA",
    "sourceUrl": "https://plato.stanford.edu/entries/embodied-cognition/",
    "isDaily": false,
    "topics": [
      "language",
      "mind",
      "society"
    ],
    "copy": {
      "pt": {
        "category": "CIÊNCIAS COGNITIVAS • DOSSIÊ",
        "title": "A mente não é um software instalado no cérebro",
        "dek": "A metáfora hardware–software seduz pela simplicidade, mas apaga corpo, plasticidade, história e relações sociais."
      },
      "en": {
        "category": "COGNITIVE SCIENCE • DOSSIER",
        "title": "The mind is not software installed in the brain",
        "dek": "The hardware–software metaphor is seductively simple, yet it erases body, plasticity, history and social relations."
      },
      "es": {
        "category": "CIENCIAS COGNITIVAS • DOSIER",
        "title": "La mente no es un software instalado en el cerebro",
        "dek": "La metáfora hardware–software es seductora, pero borra cuerpo, plasticidad, historia y relaciones sociales."
      },
      "zh": {
        "category": "认知科学 • 专题",
        "title": "心智不是安装在大脑里的软件",
        "dek": "软硬件比喻虽然简洁，却抹去了身体、可塑性、历史和社会关系。"
      },
      "hi": {
        "category": "संज्ञानात्मक विज्ञान • डॉसियर",
        "title": "मन मस्तिष्क में स्थापित सॉफ़्टवेयर नहीं है",
        "dek": "हार्डवेयर–सॉफ़्टवेयर रूपक सरल है, पर शरीर, प्लास्टिसिटी, इतिहास और सामाजिक संबंधों को मिटा देता है।"
      },
      "ja": {
        "category": "認知科学 • 特集",
        "title": "心は脳にインストールされたソフトウェアではない",
        "dek": "ハードウェア／ソフトウェア比喩は簡潔だが、身体、可塑性、歴史、社会関係を消してしまう。"
      },
      "ru": {
        "category": "КОГНИТИВНЫЕ НАУКИ • ДОСЬЕ",
        "title": "Разум — не программа, установленная в мозге",
        "dek": "Метафора «железо–софт» проста, но стирает тело, пластичность, историю и социальные отношения."
      }
    }
  },
  {
    "slug": "eterno-retorno-teoria-cosmologica",
    "date": "2026-08-25",
    "readMinutes": 9,
    "image": "https://www.aei.mpg.de/27314/original-1565261924.jpg?t=ZXlKM2FXUjBhQ0k2TVRNM09Dd2liMkpxWDJsa0lqb3lOek14TkgwPS0tZTU1Yjg0MjMzYjhjNjEzOThmZjM0YjNiYTY1ZmNjYWNjYWE3ZmQ2YQ",
    "imageAlt": "Modelo científico ilustrado de um universo com contração e expansão",
    "imageCredit": "Max Planck Institute for Gravitational Physics / AEI",
    "imageCreditUrl": "https://www.aei.mpg.de/27266/asking-the-most-fundamental-questions-about-the-universe",
    "sourceName": "Dossiê autoral — eterno retorno e cosmologias cíclicas",
    "sourceUrl": "https://plato.stanford.edu/entries/cosmology/",
    "isDaily": false,
    "topics": [
      "society",
      "physics",
      "cosmos"
    ],
    "copy": {
      "pt": {
        "category": "FILOSOFIA DA FÍSICA • ENSAIO",
        "title": "O eterno retorno poderia ser uma teoria cosmológica?",
        "dek": "Entre o experimento mental de Nietzsche e os modelos cíclicos da física há uma ponte legítima — mas não uma identidade."
      },
      "en": {
        "category": "PHILOSOPHY OF PHYSICS • ESSAY",
        "title": "Could eternal recurrence be a cosmological theory?",
        "dek": "A legitimate bridge exists between Nietzsche’s thought experiment and cyclic physics — but not an identity."
      },
      "es": {
        "category": "FILOSOFÍA DE LA FÍSICA • ENSAYO",
        "title": "¿Podría el eterno retorno ser una teoría cosmológica?",
        "dek": "Existe un puente legítimo entre Nietzsche y la física cíclica, pero no una identidad."
      },
      "zh": {
        "category": "物理哲学 • 论文",
        "title": "永恒轮回能成为宇宙学理论吗？",
        "dek": "尼采的思想实验与循环宇宙模型之间存在合理桥梁，但二者并不相同。"
      },
      "hi": {
        "category": "भौतिकी का दर्शन • निबंध",
        "title": "क्या शाश्वत पुनरावृत्ति ब्रह्मांडीय सिद्धांत हो सकती है?",
        "dek": "नीत्शे के विचार-प्रयोग और चक्रीय भौतिकी के बीच वैध पुल है, पर दोनों समान नहीं।"
      },
      "ja": {
        "category": "物理学の哲学 • 論考",
        "title": "永劫回帰は宇宙論になりうるか",
        "dek": "ニーチェの思考実験と循環宇宙論の間には正当な橋があるが、同一ではない。"
      },
      "ru": {
        "category": "ФИЛОСОФИЯ ФИЗИКИ • ЭССЕ",
        "title": "Может ли вечное возвращение стать космологической теорией?",
        "dek": "Между опытом Ницше и циклической физикой есть законный мост, но не тождество."
      }
    }
  }
];

export function getArticle(slug: string) { return articles.find((article) => article.slug === slug); }
