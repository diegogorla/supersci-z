# Ativação segura do Supabase

O cadastro, a medição e o paywall permanecem desativados até todas as etapas abaixo estarem concluídas. O modo desativado mantém a edição inaugural aberta e não cria cookies de medição.

1. Crie um projeto Supabase e aplique as migrações em ordem. `202608310005_prepare_membership_cutover.sql` encerra a antiga fase inaugural aberta: revoga o RPC de conteúdo acessível ao navegador e preserva uma rota emergencial exclusiva do servidor enquanto `MEMBERSHIP_ENABLED=false`. O conteúdo integral não faz parte do repositório: ele é criado somente pelo pipeline editorial validado no banco.
2. Configure no Sites, nunca em arquivos versionados:
   - `NEXT_PUBLIC_SUPABASE_URL` — público;
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — público;
   - `SUPABASE_SECRET_KEY` — segredo server-side;
   - `READER_COOKIE_SECRET` — segredo aleatório de pelo menos 32 caracteres;
   - `ACCOUNT_DATA_HMAC_SECRET` — segredo distinto, usado para pseudonimizar os e-mails de convites Cosmos;
   - `NEXT_PUBLIC_SITE_URL=https://supersci-z.com`;
   - `MEMBERSHIP_ENABLED=true` apenas depois dos testes.
3. No Supabase Auth, defina `https://supersci-z.com` como Site URL e autorize exatamente `https://supersci-z.com/auth/callback`. No Google Cloud, a URI autorizada do cliente OAuth é `https://dtzujdvqxrfbyalrsbyj.supabase.co/auth/v1/callback`; o redirecionamento para `/auth/callback` do site acontece depois, pelo Supabase.
4. Cadastre o Client ID e o Client Secret em Supabase → Authentication → Sign In / Providers → Google. Somente depois ative `SUPABASE_GOOGLE_ENABLED=true` na hospedagem. Para código por e-mail, use `{{ .Token }}` no modelo de login; enquanto isso, o link mágico continua compatível.
5. Configure as credenciais de sandbox, os preços e o destino de webhook do Paddle. Mantenha `MEMBERSHIP_ENABLED=false` até um checkout de teste produzir uma assinatura e um cancelamento corretos.

O webhook de produção é `https://supersci-z.com/api/paddle/webhook`. Assine os eventos de transação concluída e do ciclo completo de assinatura. A chave de API e o segredo do webhook são exclusivamente server-side; o token do Paddle.js é devolvido ao navegador somente após autenticação.

Sandbox e Live usam conjuntos independentes. As variáveis antigas `PADDLE_*` continuam aceitas apenas como compatibilidade do Sandbox. O Live exige `PADDLE_LIVE_API_KEY`, `PADDLE_LIVE_CLIENT_TOKEN`, `PADDLE_LIVE_WEBHOOK_SECRET` e os seis `PADDLE_LIVE_PRICE_*`. O segredo do destino Live também precisa existir no Vault do Supabase com o nome `paddle_live_webhook_secret`. `PADDLE_ENVIRONMENT=live` e `MEMBERSHIP_ENABLED=true` só entram juntos depois que catálogo, checkout, webhook, benefício, portal, cancelamento e exclusão forem verificados no Live.

Antes do corte público, `PADDLE_LIVE_TESTER_EMAILS` pode autorizar uma lista curta de contas, separadas por vírgula, a abrir `/assine?live=1` e realizar a validação com cobrança real enquanto `MEMBERSHIP_ENABLED=false`. `PADDLE_LIVE_TESTER_EMAIL` continua aceito para uma única conta. A página normal e todas as outras contas continuam sem checkout. Remova as duas variáveis após o ensaio.

O usuário nunca recebe permissão para atualizar `reader_profiles.authority`, `subscriptions`, `entitlements`, conteúdo ou eventos de pagamento. O conteúdo integral só é devolvido por `consume_article_access_v2`, executável pelo papel administrativo do servidor. A função resolve o ambiente Paddle, o perfil Cosmos compartilhado e o limite de dispositivos antes de liberar os parágrafos protegidos. O titular Cosmos possui três acessos simultâneos no total; cada convite aceito reserva uma vaga e concede ao convidado um perfil equivalente ao Fundador, com publicidade reduzida. Novos acessos substituem o dispositivo do mesmo perfil cujo último acesso ocorreu há mais tempo.

A automação editorial usa duas vagas idempotentes por data (`publicationSlot` 1 e 2). Cada tentativa passa por `private.publish_validated_daily_article(jsonb)`, acessível somente ao papel administrativo. Fonte insuficiente, tradução incompleta, inconsistência factual ou imagem sem direito verificável coloca a vaga em quarentena; a automação não deve contornar esse resultado.
