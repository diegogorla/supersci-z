import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("separates the narrative from the critical-reading box without exposing its marker", async () => {
  const { CRITICAL_READING_MARKER, splitArticleBody } = await vite.ssrLoadModule(
    "/lib/content/article-body.ts",
  );
  const split = splitArticleBody([
    "O experimento foi realizado.",
    "O resultado medido foi este.",
    CRITICAL_READING_MARKER,
    "O desenho não permite concluir causalidade.",
    "Um teste controlado poderia resolver a incerteza.",
  ]);

  assert.deepEqual(split.narrative, ["O experimento foi realizado.", "O resultado medido foi este."]);
  assert.deepEqual(split.criticalReading, [
    "O desenho não permite concluir causalidade.",
    "Um teste controlado poderia resolver a incerteza.",
  ]);
  assert.doesNotMatch(JSON.stringify(split), /\[\[critical-reading\]\]/);
  assert.deepEqual(splitArticleBody(["Texto sem quadro."]), { narrative: ["Texto sem quadro."], criticalReading: [] });
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("keeps every scientific menu topic populated", async () => {
  const { articles } = await vite.ssrLoadModule("/app/content-public.ts");
  for (const topic of ["language", "mind", "society", "physics", "cosmos"]) {
    assert.ok(
      articles.some((article) => article.topics.includes(topic)),
      `Expected at least one article for ${topic}`,
    );
  }
});

test("renders the subscription page as one readable column", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  assert.match(css, /\.subscription-page \.legal-document \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.subscription-grid-three \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.subscription-grid h2 \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.subscription-grid article \{[^}]*background: var\(--white\); color: var\(--ink\)/);
  assert.match(css, /\.conversion-intro \{[^}]*background: #111416; color: #f5f7ef/);
  assert.match(css, /html\[data-theme="dark"\] \.legal-note \{ color: #d4ddde; \}/);
});

test("uses a native, high-contrast language selector in every reading surface", async () => {
  const selector = await readFile(path.join(root, "app/language-select.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  for (const surface of ["magazine-home.tsx", "article-view.tsx"]) {
    const source = await readFile(path.join(root, "app", surface), "utf8");
    assert.match(source, /LanguageSelect/);
    assert.doesNotMatch(source, /components\/ui\/select/);
  }
  assert.match(selector, /<select/);
  assert.match(selector, /aria-label=\{label\}/);
  assert.match(css, /\.language-trigger option \{ background: var\(--white\); color: var\(--ink\)/);
});

test("uses flexible daily-publication wording in all seven languages", async () => {
  const landing = await readFile(path.join(root, "app/landing-client.tsx"), "utf8");
  const publicCopy = await readFile(path.join(root, "app/content-public.ts"), "utf8");
  assert.match(publicCopy, /atualizadas diariamente/);
  assert.match(publicCopy, /updated daily/);
  assert.doesNotMatch(landing, /Duas matérias novas por dia|Two new stories a day|Dos artículos nuevos por día|每天两篇|2本の新記事|दो नए लेख|Два новых материала/);
  assert.doesNotMatch(publicCopy, /Duas notícias selecionadas|Two stories selected|Dos noticias seleccionadas|两则报道|2本のニュース|दो महत्वपूर्ण खबरें|Два материала, отобранные/);
});

test("renders each article in only one catalog section", async () => {
  const magazine = await readFile(path.join(root, "app/magazine-home.tsx"), "utf8");
  assert.match(magazine, /articles\.slice\(0, 8\)/);
  assert.match(magazine, /article\.isDaily && !latestSlugs\.has\(article\.slug\)/);
  assert.match(magazine, /latest\.map\(\(article\)/);
  assert.match(magazine, /category === "all" \? archive : archive\.filter/);
});

test("renders account, subscription, consent and device theme controls", async () => {
  const panel = await readFile(path.join(root, "app/conta/account-panel.tsx"), "utf8");
  const theme = await readFile(path.join(root, "app/theme-preference.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  for (const label of ["Plano ativo", "Valor contratado", "Próxima renovação", "Publicidade", "Dispositivos", "Compartilhamentos"]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /Gerenciar cobrança e renovação/);
  assert.match(panel, /Seguir o dispositivo/);
  assert.match(theme, /super-sciz-theme:v1/);
  assert.match(theme, /BOOTSTRAP_SCRIPT/);
  assert.match(css, /html\[data-theme="dark"\]/);
});

test("editorial plan allocates exactly 90 minutes and score chart uses earned-to-possible percentages", async () => {
  const { editorialSchedule, EditorialTimeline, AgentScoreChart, scorePercentage } = await vite.ssrLoadModule("/app/gestao/editorial/editorial-visuals.tsx");
  assert.equal(editorialSchedule.reduce((n, s) => n + s.minutes, 0), 90);
  assert.equal(editorialSchedule.at(-1).time, "16h27–16h30");
  const flow = renderToStaticMarkup(React.createElement(EditorialTimeline));
  assert.match(flow, /Rafa · 15h00/);
  assert.match(flow, /Reserva para correções/);
  assert.equal(scorePercentage(6, 10), 60);
  assert.equal(scorePercentage(-4, 10), -40);
  assert.equal(scorePercentage(1, 3), 33.33);
  assert.equal(scorePercentage(0, 0), null);
  const score = (points) => ({ points, possible: 10, index: null });
  const html = renderToStaticMarkup(React.createElement(AgentScoreChart, { generatedAt: "fixture", agents: [
    { code: "rafa", name: "Rafa", week: score(-4), month: score(0), quarter: score(0) },
    { code: "fred", name: "Fred", week: score(6), month: score(0), quarter: score(0) },
    { code: "new", name: "Novo", week: { points: 0, possible: 0, index: null }, month: score(0), quarter: score(0) },
  ] }));
  assert.match(html, /Rafa: -40%; -4 pontos obtidos de 10 possíveis/);
  assert.match(html, /Fred: 60%; 6 pontos obtidos de 10 possíveis/);
  assert.match(html, /Novo: Sem avaliação percentual/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /aria-pressed="true"/);
});
