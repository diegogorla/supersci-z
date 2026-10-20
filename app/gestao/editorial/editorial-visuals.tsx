"use client";

import { useState } from "react";
import styles from "./editorial-dashboard.module.css";

export const editorialSchedule = [
  { time: "15h00–15h03", minutes: 3, who: "Rafa", task: "Abrir o ciclo e acionar Fred", detail: "Distribuir tarefas, prazos e acompanhamento das duas matérias." },
  { time: "15h03–15h15", minutes: 12, who: "Fred → Rafa", task: "Selecionar temas e fontes", detail: "Quatro propostas: duas por vaga e uma ou duas fontes por tema. Rafa encaminha a Will." },
  { time: "15h15–15h37", minutes: 22, who: "Will → Rafa", task: "Escolher temas, redigir e ilustrar", detail: "Will escolhe um tema por vaga e escreve dois candidatos por tema, cada um com ao menos uma imagem." },
  { time: "15h37–15h49", minutes: 12, who: "Fred → Rafa", task: "Checar fatos, texto e imagens", detail: "Conferir fontes, números, conceitos e imagens antes de Luis. Rafa conduz correções; após segunda análise sem aprovação, entra o texto reserva." },
  { time: "15h49–15h57", minutes: 8, who: "Luis → Rafa", task: "Revisão final em português", detail: "Atratividade, linguagem, adequação editorial, ética, interesses comerciais e gramática." },
  { time: "15h57–16h17", minutes: 20, who: "Will → Rafa → Fred → Rafa → Luis → Rafa", task: "Traduções e aprovações", detail: "Inglês primeiro, depois os outros cinco idiomas. Fred verifica fidelidade; Luis aprova cada versão." },
  { time: "16h17–16h27", minutes: 10, who: "Rafa coordena Will, Fred e Luis", task: "Reserva para correções", detail: "Resolver devoluções e obter aprovações das versões corrigidas. Não é nova revisão após aprovação de Luis." },
  { time: "16h27–16h30", minutes: 3, who: "Rafa", task: "Publicar e confirmar entrega", detail: "Publicar as duas matérias nos sete idiomas e informar os links. Sem outra revisão editorial." },
];

export function EditorialTimeline() {
  return <section className={styles.visualPanel} aria-labelledby="timeline-heading">
    <h2 id="timeline-heading">Fluxo e distribuição dos 90 minutos</h2>
    <p>Planejamento das duas matérias em conjunto · horário de Brasília · janelas ajustáveis por Rafa, sem reduzir os critérios editoriais.</p>
    <div className={styles.rafaLane}><strong>Rafa · 15h00 → 16h30</strong><span>Aciona → recebe → encaminha → cobra → intervém → conclui</span></div>
    <div className={styles.timeAxis}><span>15h00</span><span>15h30</span><span>16h00</span><span>16h30</span></div>
    <div className={styles.allocation} role="img" aria-label={editorialSchedule.map((s) => `${s.task}: ${s.minutes} minutos`).join("; ")}>
      {editorialSchedule.map((s, i) => <span key={s.task} style={{ flex: s.minutes, background: i % 2 ? "#3296a4" : "#70dce3" }} aria-hidden="true" />)}
    </div>
    <ol className={styles.phaseGrid}>
      {editorialSchedule.map((s, i) => <li key={s.task}>
        <span className={styles.phaseNumber}>{i + 1}</span>
        <div><strong>{s.time} · {s.minutes} min</strong><h3>{s.task}</h3><span className={styles.phaseWho}>{s.who}</span><p>{s.detail}</p></div>
      </li>)}
    </ol>
    <p className={styles.scheduleNote}>Qualquer devolução passa por Rafa. O prazo é 16h30; 17h00 é o limite de tolerância, fora dos 90 minutos planejados. Isto é um plano de execução, não uma medição de produtividade nem um novo agendamento.</p>
  </section>;
}

type Window = { points: number; possible: number; index: number | null };
type Agent = { code: string; name: string; week: Window; month: Window; quarter: Window };
export function scorePercentage(points: number, possible: number): number | null {
  return possible > 0 ? Math.round(points / possible * 10000) / 100 : null;
}

const percentLabel = (value: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;

export function AgentScoreChart({ agents, generatedAt }: { agents: Agent[]; generatedAt: string }) {
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("week");
  const values = agents.map((a) => ({ agent: a, score: a[period], percentage: scorePercentage(a[period].points, a[period].possible) }));
  const limit = Math.max(100, ...values.map((v) => Math.ceil(Math.abs(v.percentage ?? 0) / 25) * 25));
  return <section className={styles.visualPanel} aria-labelledby="score-chart-heading">
    <h2 id="score-chart-heading">Aproveitamento de cada agente</h2>
    <p>Percentual = pontos obtidos ÷ máximo possível × 100. O saldo inclui bônus, penalidades e estornos.</p>
    <div className={styles.periodPicker} role="group" aria-label="Período da pontuação">
      {([["week", "Semana"], ["month", "Mês"], ["quarter", "Trimestre"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}
    </div>
    <div className={styles.scoreAxis}><span>−{limit}%</span><span>0%</span><span>{limit}%</span></div>
    <div className={styles.scoreChart} aria-live="polite">
      {values.map(({ agent: a, score, percentage }) => {
        const width = Math.abs(percentage ?? 0) / limit * 50;
        const label = percentage === null ? "Sem avaliação percentual" : percentLabel(percentage);
        return <div className={styles.scoreChartRow} key={a.code}>
          <div><a href={`/gestao/editorial?agente=${encodeURIComponent(a.code)}`}>{a.name}</a><strong className={(percentage ?? 0) < 0 ? styles.negative : styles.positive}>{label}</strong></div>
          <div className={styles.scoreTrack} role="img" aria-label={`${a.name}: ${label}; ${score.points} pontos obtidos de ${score.possible} possíveis`}><span className={styles.scoreZero} />{percentage !== null && percentage !== 0 && <span className={styles.scoreBar} style={{ left: `${percentage < 0 ? 50 - width : 50}%`, width: `${width}%`, background: percentage < 0 ? "#fda4af" : "#6ee7b7" }} />}</div>
          <p className={styles.scoreFraction}>{score.points} pontos obtidos / {score.possible} possíveis{percentage === null ? " · Ainda sem máximo positivo registrado." : ` = ${label}`}</p>
        </div>;
      })}
    </div>
    <p>Máximo das oportunidades de pontuação registradas no período. Dados de {generatedAt}; use “Atualizar” para consultar novos lançamentos. Sem consultas automáticas periódicas.</p>
  </section>;
}
