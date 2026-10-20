import type { Metadata } from "next";
import { PublicLegalShell as LegalShell } from "../public-legal-shell";

export const metadata: Metadata = { title: "Quem somos | SUPER SCI-Z", description: "Conheça a missão, o método, a independência e a responsabilidade editorial da SUPER SCI-Z.", alternates: { canonical: "/sobre" } };

export default function AboutPage() {
  return (
    <LegalShell eyebrow="INSTITUCIONAL / QUEM SOMOS" title="Ciência de verdade na sua língua" intro={null} updatedDate="20 de setembro de 2026">
      <section>
        <h2>Quem somos</h2>
        <p>A SUPER SCI-Z é uma revista científica, filosófica e cultural independente de propriedade da empresa Mateus de Aquino ME, com intuito de ampliar o alcance da ciência, aproximando o público interessado às pesquisas acadêmicas de ponta. Cientes de que as grandes questões do conhecimento não são respondidas dentro de fronteiras disciplinares, a SUPER SCI-Z nasce com a visão de expandir horizontes e integrar as áreas da ciência, trazendo os saberes produzidos pelas diversas linhas de pesquisa ao alcance de todos os interessados, fomentando o intercâmbio de descobertas e a colaboração saudável de cientistas que protagonizam na vanguarda do avanço científico e tecnológico.</p>
        <p>A seleção dos assuntos, neste primeiro momento de existência, deriva do conhecimento ou paixão dos editores, aptos à curadoria dos conteúdos de Filosofia, Sociologia, Ciência de Dados, Computação, Inteligência Artificial, Neurociências, Bioquímica, Linguística, Psicologia, Ciências Cognitivas, Física, Cosmologia, Astronomia e Inovação Tecnológica. Todos os artigos são elaborados pela equipe editorial da SUPER SCI-Z em conjunto com cientistas, pesquisadores, consultores e podem ter auxílio de Inteligência Artificial, usada também para publicação em 6 idiomas além da língua original em que são escritos. A maioria dos artigos são escritos em Português e alguns são elaborados em inglês.</p>
        <p>Publicamos para interessados em conhecer e compreender os assuntos da ciência com clareza, cientistas ou leigos, especialistas ou amadores, proporcionando acesso ao fazer científico com profundidade, sem obscuridades, trazendo com honestidade e de forma acessível as descobertas que possam inspirar mais pessoas a transpirar ciência.</p>
      </section>
      <section>
        <h2>Missão editorial</h2>
        <p>Nosso objetivo não é somente informar o leitor sobre descobertas científicas, mas trazer o real conteúdo de pesquisas ao público com linguagem acessível, mas de forma aprofundada, rejeitando a simplicidade reducionista e o sensacionalismo do exagero e desinformação.</p>
      </section>
      <section>
        <h2>Método editorial</h2>
        <p>Priorizamos artigos científicos originais, universidades, observatórios, agências públicas, organizações internacionais e instituições reconhecidas de pesquisa. Sempre que possível, confrontamos mais de uma fonte e distinguimos dado observado, inferência, hipótese, interpretação e especulação.</p>
        <p>Relevância também é qualidade de temas que não costumam ganhar popularidade. Selecionamos assuntos por sua importância científica e social, e procuramos formulá-los na linguagem das perguntas reais, que nos levam à curiosidade, à busca e à consciência da importância da precisão e do questionamento contínuo. Acreditamos que o impopular também deve ter seu espaço na sociedade, e trabalhamos para garantir que, na SUPER SCI-Z, todos os temas encontram espaço.</p>
      </section>
      <section>
        <h2>Independência e financiamento</h2>
        <p>O modelo da SUPER SCI-Z combina publicidade, assinaturas e apoio de leitores com transparência. Anúncios não conferem influência sobre conclusões editoriais e são visualmente identificados. Conteúdos patrocinados, caso existam, recebem identificação própria e não são apresentados como reportagem independente.</p>
      </section>
      <section>
        <h2>Atualização e correções</h2>
        <p>A revista é atualizada diariamente. Correções que alterem o sentido científico de uma matéria serão incorporadas com transparência. Sugestões e contestações fundamentadas podem ser enviadas para <a href="mailto:adm@supersci-z.com">adm@supersci-z.com</a>.</p>
      </section>
      <section>
        <h2>Uso responsável de inteligência artificial</h2>
        <p>Ferramentas de inteligência artificial podem apoiar pesquisa, organização documental, síntese, tradução e edição. Elas não substituem a verificação de fontes nem assumem autoria moral. A seleção de temas, a orientação editorial, a revisão crítica e a responsabilidade final pelo conteúdo permanecem humanas.</p>
      </section>
      <section>
        <h2>Responsabilidade</h2>
        <p>A SUPER SCI-Z é um projeto editorial independente de propriedade e sob responsabilidade da empresa Mateus de Aquino ME. Contato corporativo, administrativo e editorial: <a href="mailto:adm@supersci-z.com">adm@supersci-z.com</a></p>
      </section>
    </LegalShell>
  );
}
