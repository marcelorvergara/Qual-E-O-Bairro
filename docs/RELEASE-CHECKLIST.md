# Checklist de lançamento

Execute esta lista no dia do lançamento, depois de o PR estar aprovado. A semeadura do diário é uma operação humana; não a execute a partir de automações de agentes.

## Cloudflare

- [ ] No Workers Builds, configure `npm run build`, saída `dist` e as variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GA_MEASUREMENT_ID` e `VITE_ENABLE_EN` conforme a decisão de lançamento.
- [ ] Conecte `qualeobairro.com.br`, confirme DNS, HTTPS e o fallback de SPA; faça um smoke test da URL de produção.

## Supabase

- [ ] Siga a ordem e as consultas de verificação de [MIGRATIONS.md](../supabase/MIGRATIONS.md); não use `supabase db push`.
- [ ] Configure `ALLOWED_ORIGINS` para incluir `https://qualeobairro.com.br` e faça o reset transacional descrito no plano.
- [ ] Execute manualmente `npm run seed:daily -- --from=2026-08-25 --days=120` e confirme que o bootstrap de `2026-08-25` devolve o puzzle #1 sem revelar a resposta.

## GA4

- [ ] Recuse e aceite o consentimento em produção; confirme Consent Mode v2 e os eventos `game_start`, `guess`, `hint_used`, `win` e `share` no GA4 DebugView.

## WhatsApp

- [ ] Envie `https://qualeobairro.com.br/` pelo WhatsApp e confirme título, descrição e imagem Open Graph; atualize o cache do depurador de compartilhamento se necessário.

## iOS

- [ ] No Safari de um iPhone, teste o foco e o teclado do campo de bairro, safe areas, `100dvh`, alternância de idioma e o compartilhamento nativo.
