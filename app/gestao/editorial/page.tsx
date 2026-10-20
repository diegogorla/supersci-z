import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Award, Clock3, Database, ExternalLink, FileCheck2, Hash, RefreshCw, ShieldCheck } from "lucide-react";
import { BrandWordmark } from "@/app/brand-mark";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { EditorialTimeline, AgentScoreChart } from "./editorial-visuals";
import { HumanReviewForm } from "./human-review-form";
import styles from "./editorial-dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Painel editorial | SUPER SCI-Z",
  description: "Acompanhamento auditável da operação editorial da SUPER SCI-Z.",
  robots: { index: false, follow: false },
};

type ScoreWindow = { points: number; possible: number; index: number | null };
type BadgeRecord = { code?: string; label?: string; awardedAt?: string };
type AgentSummary = {
  code: string;
  name: string;
  role: string;
  model: string;
  reasoningEffort: string;
  status: string;
  week: ScoreWindow;
  month: ScoreWindow;
  quarter: ScoreWindow;
  credentials: { badgeCount: number; badges: BadgeRecord[] };
};
type Dashboard = {
  policyVersion: string;
  generatedAt: string;
  agents: AgentSummary[];
  openCycles: Array<{ id: string; date: string; status: string; policyVersion: string; topics: Array<{ id: string; theme: number; slot: string; label: string; candidate: number; status: string; slug: string | null }> }>;
  pendingHumanReviews: Array<{ id: string; slug: string; title: string; dueAt: string; overdue: boolean; languageCount: number; adequacyCount: number; attractivenessCount: number; note: string }>;
  pendingOtherScoring: Array<{ id: string; slug: string; count: number; note: string }>;
  teamRewards: Array<{ id: string; periodStart: string; periodEnd: string; points: number; possible: number; status: string; options: unknown; selectedReward: unknown }>;
  scoreRules: Array<{ code: string; role: string; points: number; possible: number; humanRequired: boolean; description: string }>;
};
type ScoreEvent = { at: string; rule: string; points: number; possible: number; eventKey: string; slug: string | null; reverses: string | null };
type AuditEvent = { at: string; seq: number; scope: "system" | "cycle"; type: string; payload: unknown; previousHash: string | null; hash: string; cycleId: string | null; topicId: string | null };
type AgentHistory = {
  agent: { code: string; name: string; role: string; model: string; reasoningEffort: string; status: string; generation: number; contract: Record<string, unknown>; credentials: { badgeCount: number; badges: BadgeRecord[] } };
  scores: ScoreEvent[];
  history: AuditEvent[];
};
type ChainStatus = { valid: boolean; events?: number; headHash?: string | null; failedAt?: number; reason?: string };

const roleLabels: Record<string, string> = {
  orchestrator: "Orquestrador",
  writer: "Redator",
  content_editor: "Editor de conteúdo",
  editor_in_chief: "Editor-chefe",
};
const effortLabels: Record<string, string> = { medium: "médio", high: "alto", xhigh: "extra alto", max: "máximo" };

function formatDate(value: string, includeTime = true) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

function scoreIndex(score: ScoreWindow) {
  return score.possible > 0 && score.index !== null ? `${score.index}%` : "—";
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    policy_activated: "Política ativada",
    agent_registered: "Agente registrado",
    role_contract_assigned: "Contrato de função atribuído",
    automation_bound: "Automação vinculada",
    cycle_started: "Ciclo iniciado",
    topic_selected: "Tema selecionado",
    artifact_created: "Versão registrada",
    review_recorded: "Revisão registrada",
    handoff_recorded: "Entrega entre agentes",
    score_recorded: "Pontuação registrada",
    article_published: "Artigo publicado",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function compactHash(value: string | null | undefined) {
  if (!value) return "início da cadeia";
  return `${value.slice(0, 14)}…${value.slice(-10)}`;
}

function AccessDenied() {
  return <main className={styles.denied}><section><AlertTriangle /><span>ACESSO RESTRITO</span><h1>Este painel exige perfil de administrador.</h1><p>A sessão atual está autenticada, mas não possui a autoridade necessária.</p><Link href="/conta"><ArrowLeft /> Voltar à conta</Link></section></main>;
}

export default async function EditorialDashboardPage({ searchParams }: { searchParams: Promise<{ agente?: string }> }) {
  const context = await getAuthenticatedAccountContext();
  if (!context) redirect(`/entrar/administracao?next=${encodeURIComponent("/gestao/editorial")}`);
  if (context.authority !== "admin") return <AccessDenied />;

  const dashboardResult = await context.supabase.rpc("get_moe3_dashboard");
  if (dashboardResult.error || !dashboardResult.data) throw new Error("Não foi possível carregar o painel editorial.");
  const dashboard = dashboardResult.data as Dashboard;
  const requestedAgent = (await searchParams).agente;
  const selectedCode = dashboard.agents.some((agent) => agent.code === requestedAgent) ? requestedAgent! : dashboard.agents[0]?.code;

  const [historyResult, systemChainResult] = await Promise.all([
    selectedCode ? context.supabase.rpc("get_moe3_agent_history", { p_agent_code: selectedCode, p_limit: 500 }) : Promise.resolve({ data: null, error: null }),
    context.supabase.rpc("verify_moe3_system_chain"),
  ]);
  if (historyResult.error || !historyResult.data) throw new Error("Não foi possível carregar o histórico do agente.");
  const history = historyResult.data as AgentHistory;
  const systemChain = (systemChainResult.data ?? { valid: false, reason: "verification_unavailable" }) as ChainStatus;
  const cycleIds = [...new Set(history.history.filter((event) => event.scope === "cycle" && event.cycleId).map((event) => event.cycleId!))];
  const cycleChecks = await Promise.all(cycleIds.map(async (cycleId) => {
    const result = await context.supabase.rpc("verify_moe3_audit_chain", { p_cycle_id: cycleId });
    return [cycleId, (result.data ?? { valid: false, reason: "verification_unavailable" }) as ChainStatus] as const;
  }));
  const cycleIntegrity = new Map(cycleChecks);
  const generatedAt = formatDate(dashboard.generatedAt);

  return <main className={styles.page}>
    <header className={styles.header}>
      <BrandWordmark href="/" variant="compact" priority />
      <nav aria-label="Navegação administrativa">
        <Link href="/conta">Minha conta</Link>
        <Link href="/"><ArrowLeft /> Revista</Link>
      </nav>
    </header>

    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>ADMINISTRAÇÃO / OPERAÇÃO EDITORIAL</span>
        <h1>Painel editorial</h1>
        <p>Pontos, revisões, versões e decisões da equipe de quatro agentes, com cadeia de auditoria verificável.</p>
      </div>
      <div className={styles.heroActions}>
        <span><Clock3 /> Atualizado em {generatedAt}</span>
        <Link href={`/gestao/editorial?agente=${encodeURIComponent(selectedCode)}`}><RefreshCw /> Atualizar</Link>
      </div>
    </section>

    <section className={styles.section} aria-label="Coordenação de Rafa Nascimento">
      <div className={styles.panel}>
        <h2>Rafa Nascimento · Orquestração editorial</h2>
        <p><strong>Rafa inicia, encaminha, acompanha e cobra cada etapa até concluir as duas publicações.</strong></p>
        <ol>
          <li>Rafa abre o ciclo e solicita a Fred quatro propostas de tema, duas por vaga, com uma ou duas fontes cada.</li>
          <li>Fred entrega a Rafa; Will escolhe um tema por vaga e escreve dois candidatos por tema, cada um com ao menos uma imagem.</li>
          <li>Will entrega a Rafa; Rafa encaminha a Fred para checagem factual, texto e imagem.</li>
          <li>Fred devolve a Rafa; Will corrige. Sem aprovação na segunda análise de Fred, Rafa ativa o texto reserva e reinicia a revisão.</li>
          <li>Com a aprovação de Fred, Rafa encaminha a Luis para a revisão final.</li>
          <li>Luis devolve a Rafa; havendo apontamentos, Rafa conduz o retorno a Will, Fred e Luis.</li>
          <li>Após a aprovação de Luis nos sete idiomas, Rafa publica, confirma as duas entregas e reporta o resultado.</li>
        </ol>
        <p>Rafa define os prazos intermediários, confirma o início e o término de cada tarefa e aciona o próximo agente assim que recebe a entrega. Qualquer interrupção sem conclusão exige cobrança e intervenção de Rafa. O objetivo é publicar às 16h30; a tolerância de 30 minutos não é uma extensão planejada do prazo.</p>
        <p>Início: 15h · publicação: 16h30 · tolerância: até 17h · horário de Brasília. Duas matérias por ciclo. Telemetria do modelo é opcional. Depois da aprovação de Luis, não há outra checagem editorial.</p>
        <p>−8 por artigo não publicado; +8 a cada três dias consecutivos pontuais; −6 por problema solucionável que Rafa deixou sem solução; +6 por intervenção atípica que garantiu publicação; −2 após a tolerância e a cada 30 minutos adicionais de atraso do ciclo.</p>
        <p>Luis avalia Rafa, Will e Fred; Rafa avalia Luis. Cada lançamento exige evidências. Não há fiscalização horária: Rafa continua na mesma execução enquanto houver trabalho ou falha solucionável. Diante de impedimento incontornável, informa por e-mail e notificação e encerra. O atraso conta até a publicação ou o envio confirmado dos dois avisos.</p>
      </div>
    </section>

    <EditorialTimeline />
    <AgentScoreChart agents={dashboard.agents} generatedAt={generatedAt} />

    <section className={`${styles.integrity} ${systemChain.valid ? styles.valid : styles.invalid}`} aria-label="Integridade da cadeia de auditoria">
      {systemChain.valid ? <ShieldCheck /> : <AlertTriangle />}
      <div><strong>{systemChain.valid ? "Cadeia de sistema íntegra" : "Falha de integridade"}</strong><span>{systemChain.events ?? 0} eventos registrados, sem limite de retenção.</span></div>
      <details><summary>Hash atual</summary><code>{systemChain.headHash ?? "A cadeia ainda não possui hash."}</code></details>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><span>01</span><h2>Equipe e pontos</h2></div><p>Clique no nome para abrir o histórico auditável do agente.</p></div>
      <div className={styles.agentGrid}>
        {dashboard.agents.map((agent) => <Link className={`${styles.agentCard} ${agent.code === selectedCode ? styles.selectedAgent : ""}`} href={`/gestao/editorial?agente=${encodeURIComponent(agent.code)}`} key={agent.code} aria-current={agent.code === selectedCode ? "page" : undefined}>
          <div className={styles.agentIdentity}><span>{roleLabels[agent.role] ?? agent.role}</span><h3>{agent.name}</h3><p>{agent.model} · esforço {effortLabels[agent.reasoningEffort] ?? agent.reasoningEffort}</p></div>
          <div className={styles.scoreGrid}>
            {[['Semana', agent.week], ['Mês', agent.month], ['Trimestre', agent.quarter]].map(([label, score]) => {
              const item = score as ScoreWindow;
              return <div key={label as string}><span>{label as string}</span><strong>{signed(item.points)} / {item.possible}</strong><small>{scoreIndex(item)}</small></div>;
            })}
          </div>
          <div className={styles.cardFooter}><span>{agent.credentials.badgeCount} selo(s)</span><span>Ver histórico →</span></div>
        </Link>)}
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><span>02</span><h2>Histórico de {history.agent.name}</h2></div><p>{roleLabels[history.agent.role] ?? history.agent.role} · geração {history.agent.generation}</p></div>
      <div className={styles.profileStrip}>
        <div><span>Modelo</span><strong>{history.agent.model}</strong></div>
        <div><span>Raciocínio</span><strong>{effortLabels[history.agent.reasoningEffort] ?? history.agent.reasoningEffort}</strong></div>
        <div><span>Status</span><strong>{history.agent.status === "active" ? "ativo" : history.agent.status}</strong></div>
        <div><span>Credenciais</span><strong><Award /> {history.agent.credentials.badgeCount} selo(s)</strong></div>
      </div>
      <details className={styles.contract}><summary>Responsabilidades e limites do agente</summary><pre>{JSON.stringify(history.agent.contract, null, 2)}</pre></details>

      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <div className={styles.panelTitle}><Database /><div><h3>Cadeia de eventos</h3><p>O histórico é cumulativo. A validação usa todos os eventos da cadeia, não somente os exibidos nesta tela.</p></div></div>
          {history.history.length === 0 ? <p className={styles.empty}>Nenhum evento atribuído a este agente.</p> : <ol className={styles.timeline}>
            {history.history.map((event) => {
              const integrity = event.scope === "system" ? systemChain : event.cycleId ? cycleIntegrity.get(event.cycleId) : undefined;
              return <li key={`${event.scope}-${event.seq}-${event.hash}`}>
                <div className={styles.timelineMeta}><span>{event.scope === "system" ? "Sistema" : `Ciclo · ${event.cycleId?.slice(0, 8)}`}</span><time>{formatDate(event.at)}</time></div>
                <h4>{eventLabel(event.type)}</h4>
                <div className={styles.hashLine}><Hash /><code title={event.hash}>{compactHash(event.hash)}</code><span className={integrity?.valid ? styles.chainOk : styles.chainBad}>{integrity?.valid ? "cadeia válida" : "não verificada"}</span></div>
                <details><summary>Dados e hashes</summary><dl><div><dt>Hash anterior</dt><dd><code>{event.previousHash ?? "início da cadeia"}</code></dd></div><div><dt>Hash do evento</dt><dd><code>{event.hash}</code></dd></div></dl><pre>{JSON.stringify(event.payload, null, 2)}</pre></details>
              </li>;
            })}
          </ol>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}><FileCheck2 /><div><h3>Lançamentos de pontos</h3><p>Créditos, penalidades e estornos permanecem no histórico.</p></div></div>
          {history.scores.length === 0 ? <p className={styles.empty}>Nenhum ponto lançado até agora.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>Regra</th><th>Artigo</th><th>Pontos</th></tr></thead><tbody>
            {history.scores.map((score) => <tr key={score.eventKey}><td>{formatDate(score.at)}</td><td><code>{score.rule}</code>{score.reverses && <small>Estorno auditável</small>}</td><td>{score.slug ?? "—"}</td><td className={score.points < 0 ? styles.negative : styles.positive}>{signed(score.points)}</td></tr>)}
          </tbody></table></div>}
        </section>
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><span>03</span><h2>Ciclos em andamento</h2></div><p>Estado atual das pautas, candidatos e publicação.</p></div>
      {dashboard.openCycles.length === 0 ? <p className={styles.emptyBlock}>Nenhum ciclo editorial está aberto.</p> : <div className={styles.cycleGrid}>{dashboard.openCycles.map((cycle) => <article className={styles.cycleCard} key={cycle.id}>
        <div><span>{cycle.date}</span><strong>{cycle.status}</strong><small>{cycle.policyVersion}</small></div>
        <ul>{cycle.topics.map((topic) => <li key={topic.id}><span>Tema {topic.theme} · {topic.slot}</span><strong>{topic.label}</strong><small>Candidato {topic.candidate} · {topic.status}{topic.slug ? ` · ${topic.slug}` : ""}</small></li>)}</ul>
      </article>)}</div>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><span>04</span><h2>Aguardando curadoria</h2></div><p>Abra a matéria, informe as duas quantidades e salve. Conclua a avaliação após cinco dias.</p></div>
      {dashboard.pendingHumanReviews.length === 0 ? <p className={styles.emptyBlock}>Nenhuma revisão humana pendente.</p> : <div className={styles.reviewList}>{dashboard.pendingHumanReviews.map((review) => <article key={review.id}>
        <div className={styles.reviewHeader}><div><span>{review.overdue ? "Prazo concluído" : "Aguardando cinco dias"}</span><h3><a href={`/artigo/${review.slug}`} target="_blank" rel="noreferrer">{review.title ?? review.slug}</a></h3><time>Disponível em {formatDate(review.dueAt)}</time></div><a href={`/artigo/${review.slug}`} target="_blank" rel="noreferrer">Abrir matéria <ExternalLink /></a></div>
        <HumanReviewForm reviewId={review.id} canFinalize={review.overdue} initialLanguageCount={review.languageCount} initialAdequacyCount={review.adequacyCount} initialAttractivenessCount={review.attractivenessCount} initialNote={review.note} />
      </article>)}</div>}
    </section>

    {(dashboard.pendingOtherScoring?.length ?? 0) > 0 && <section className={styles.section}>
      <h2>Apontamentos diversos aguardando enquadramento</h2>
      <p>As quantidades estão preservadas. As regras atuais distinguem problemas de marca/diretriz e atratividade/relevância, com responsáveis diferentes.</p>
      <ul>{dashboard.pendingOtherScoring.map((review) => <li key={review.id}><a href={`/artigo/${review.slug}`}>{review.slug}</a> · {review.count} apontamento(s){review.note ? ` · ${review.note}` : ""}</li>)}</ul>
    </section>}

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><span>05</span><h2>Recompensas da equipe</h2></div><p>Ciclos trimestrais e escolha registrada para ação humana.</p></div>
      {dashboard.teamRewards.length === 0 ? <p className={styles.emptyBlock}>Nenhum ciclo trimestral encerrado.</p> : <div className={styles.rewardGrid}>{dashboard.teamRewards.map((reward) => <article key={reward.id}><Award /><span>{reward.periodStart} — {reward.periodEnd}</span><strong>{signed(reward.points)} / {reward.possible}</strong><small>{reward.status}</small></article>)}</div>}
    </section>

    <section className={styles.section} id="regras-de-pontuacao">
      <div className={styles.sectionHeading}><div><span>06</span><h2>Regras de pontuação</h2></div><p>Regras ativas da política {dashboard.policyVersion}. “Possível” compõe o denominador do índice percentual.</p></div>
      <div className={styles.tableWrap}><table className={styles.rulesTable}><thead><tr><th>Responsável</th><th>Situação</th><th>Pontos</th><th>Possível</th><th>Verificação</th><th>Código</th></tr></thead><tbody>
        {dashboard.scoreRules.map((rule) => <tr key={rule.code}><td>{roleLabels[rule.role] ?? rule.role}</td><td>{rule.description}</td><td className={rule.points < 0 ? styles.negative : rule.points > 0 ? styles.positive : ""}>{signed(rule.points)}</td><td>{rule.possible}</td><td>{rule.humanRequired ? "Humana" : "Automática"}</td><td><code>{rule.code}</code></td></tr>)}
      </tbody></table></div>
    </section>
  </main>;
}
