# Deploy no Cloudflare Workers

O site é publicado como um Worker somente de assets estáticos. Não há script de
Worker nem runtime de servidor neste repositório; as operações dinâmicas ficam
nas Supabase Edge Functions.

## Workers Builds

Ao conectar o repositório a um novo projeto no Cloudflare Workers Builds, use:

- Comando de build: `npm run build`
- Diretório de saída: `dist`

O `wrangler.jsonc` na raiz configura o diretório de assets e o fallback de SPA.
O Wrangler fornecido pelo Workers Builds é suficiente; o projeto não mantém uma
dependência local dele.

Defina estas variáveis no ambiente de build:

| Variável                 | Valor                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | URL do projeto Supabase, por exemplo `https://<project-ref>.supabase.co`.                               |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima/publicável usada pelo navegador para chamar as Edge Functions.                            |
| `VITE_ENABLE_EN`         | `true` para habilitar a interface em inglês; use `false` em produção enquanto ela estiver desabilitada. |
| `VITE_GA_MEASUREMENT_ID` | ID de medição do GA4 no formato `G-XXXXXXXXXX`; deixe vazio para não carregar o Google Analytics.       |

Todas são variáveis de build do Vite, incorporadas ao bundle do navegador.
Defini-las como secrets de runtime do Worker não tem efeito.

## CORS das Supabase Edge Functions

Antes de disponibilizar a origem de produção, configure o secret
`ALLOWED_ORIGINS` das Edge Functions com uma lista separada por vírgulas que
inclua `https://qualeobairro.com.br`, além das origens locais necessárias. Por
exemplo:

```text
http://localhost:5173,https://qualeobairro.com.br
```

As funções `daily` e `submit` usam o helper compartilhado em
`supabase/functions/_shared/server.ts`, que só devolve os cabeçalhos CORS quando
a origem da requisição está nessa lista. `ALLOWED_ORIGINS` é uma variável de
runtime das Edge Functions do Supabase, não uma variável do Workers Builds.
