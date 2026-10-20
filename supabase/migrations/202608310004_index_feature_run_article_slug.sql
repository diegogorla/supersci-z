-- Evita varredura integral ao verificar ou remover a referência ao artigo publicado.
create index if not exists editorial_feature_runs_article_slug_idx
  on public.editorial_feature_runs(article_slug)
  where article_slug is not null;

