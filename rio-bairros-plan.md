# Rio Bairros — Design Doc and Implementation Plan

Name: **Qual é o Bairro?** — domain `qualeobairro.com.br` (buy before Phase 4, DNS on Cloudflare). Repo name: `qualeobairro`.

## 1. What we are building

A browser puzzle in the spirit of Globle, but for the 166 bairros of the city of Rio de Janeiro. The player types a bairro name; the map fills that bairro with a color proportional to its border-to-border distance from the secret bairro and labels it with the name and the distance in km. Adjacent bairros get a distinct "encosta" state. The player repeats until they hit the answer. There is a daily puzzle with a global leaderboard and an endless practice mode. Curated static hints (three tiers, offline-generated with an LLM and reviewed by hand) are available at a cost in guesses. After winning, a short cached explainer about the bairro is shown.

Design principle: KISS. One full-screen flat map, one input, one share button. No basemap, no tiles, no zoom, no side panels. The map itself is the guess log.

Audience: cariocas first (PT-BR), then an EN toggle for the portfolio.

## 2. Product decisions (do not reopen these inside the agent)

Distance is border-to-border, computed once at build time into a 166×166 matrix (km, one decimal). Adjacency is a boolean derived from the same build step (shared boundary, not just touching at a point). Color scale is a sequential warm ramp with five discrete stops, plus a sixth solid color for "encosta" and a seventh for the correct answer; must remain readable for deuteranopia (verify against a simulator). Input is an accent-insensitive, case-insensitive autocomplete that shows the full canonical name including parentheses ("Freguesia (Ilha)"); the bare word "Freguesia" never resolves to a guess. Guess submission requires selecting an item from the list, never free text. Repeated guesses are ignored with a toast.

The daily puzzle is defined in America/Sao_Paulo. The daily answer is never in the client bundle and never derivable from a seed; the client asks the server for a salted hash of the answer, checks each guess against it, and the server validates the final result on submission. Daily pool is a curated subset (roughly 70–90 bairros) tagged in data; practice mode offers "conhecidos" (the same pool) and "todos" (all 166). Paquetá and Argentino are excluded from the daily pool; Argentino is excluded from "todos" too.

Hints: three tiers per bairro, stored in `data/hints.json`, generated offline. Tier 1 is region-level, tier 2 is character, tier 3 is near-giveaway. A hint may not contain the bairro name or any word of it (mechanically checked). In daily mode each tier used adds one to the guess count for ranking; in practice mode hints are free.

Leaderboard: anonymous device ID stored in localStorage, optional nickname (max 20 chars, profanity filter, unique per day not required). Rank by guesses (including hint penalties), tiebreak by elapsed seconds from first guess to win. Show top 50 plus the player's own position. Anti-cheat is best-effort only: server-side validation of the guess sequence against the matrix, rate limit per device.

Share text format (PT-BR):

```
Qual é o Bairro? #123
🟥🟧🟨🟩🟩🟩🎯 7 palpites, 1 dica
https://qualeobairro.com.br
```

Attribution: "Dados: Instituto Pereira Passos / data.rio" in the footer.

## 3. Stack

Vite + TypeScript + React (small; no Next.js needed, no SSR). d3-geo for projection and SVG paths; no Leaflet, no MapLibre, no tiles. Turf only in build scripts, never in the client. Supabase (existing project or a fresh one) for `daily_answers`, `daily_results`, `bairro_explainers`, with two Edge Functions: `daily` (returns puzzle number, answer hash, salt) and `submit` (validates and stores a result, returns rank). Deploy on Vercel or Cloudflare Pages. GA4 with Consent Mode v2, same pattern as Fábula Infantil. Vitest for unit tests on the pure logic (distance lookup, color bucket, name normalization, share text).

Repository layout:

```
data/raw/            IPP files as downloaded (git-lfs or ignored)
data/bairros.geojson simplified, 4 properties only
data/roads.geojson   Linha Vermelha, Linha Amarela, Av. Brasil (optional layer)
data/landmarks.json  Cristo, Pão de Açúcar, Maracanã, Galeão runway as points/lines
data/matrix.json     border distances km + adjacency, keyed by codbairro
data/pool.json       daily pool codes
data/exclude.json    codes excluded from "todos" and daily modes
data/hints.json      three tiers per bairro
scripts/             build:geo, build:matrix, gen:hints, check:hints
src/                 app
supabase/            migrations, functions
```

## 4. Phases

Each phase is one or two PRs of at most ~600 lines of diff, each with acceptance criteria written before the agent starts. Every PR gets pasted (or the public repo link) into this chat for review before the next phase begins.

### Phase 0 — Data pipeline (human + agent, ~2h)

Simplify the IPP GeoJSON with mapshaper (target 5–8%, keep-shapes, precision 0.0001, ~300–500 KB), keep only `codbairro`, `nome`, `rp`, `regiao_adm` (trim whitespace). Write `build:matrix` (Node + turf) producing border-to-border distances and adjacency for all pairs; verify that Copacabana↔Ipanema is 0 km and adjacent, Copacabana↔Santa Cruz is roughly 55–60 km, and Paquetá is adjacent to nothing. Hand-write `pool.json` (start with the ~80 most recognizable bairros; adjust later from analytics). Extract the three roads and four landmarks from OSM via Overpass, simplify, commit. Write `gen:hints` (calls the Anthropic API once per bairro, asks for three tiers in JSON, PT-BR) and `check:hints` (fails on name leakage, length > 140 chars, or missing tiers). Run, review the JSON by hand, commit.

Acceptance: `npm run build:data` regenerates every file in `data/` deterministically from `data/raw/`; matrix sanity assertions pass; hints file passes the check and has been eyeballed.

### Phase 1 — Static map (agent, ~2h)

TODO: add the optional `data/roads.geojson` and `data/landmarks.json` context layers in a later phase.

Vite + React + TS scaffold. Full-viewport SVG, `geoMercator().fitExtent` on the bairros with padding, one `<path>` per bairro with `data-cod`, thin stroke, neutral fill, hover shows name in a small fixed corner label (no tooltip following the cursor). Roads and landmarks rendered under the strokes at low opacity behind a boolean prop. Handles resize. Mobile-first: works at 360×640 in portrait, with the map letterboxed and the bottom 20% reserved for the input.

Acceptance: renders all 166 bairros correctly oriented (Zona Sul at the bottom right, Santa Cruz at far left); no external network calls; Lighthouse performance ≥ 90 on mobile; bundle < 600 KB gzipped including data.

### Phase 2 — Practice mode game loop (done)

In portrait (viewport height greater than width), the map is fitted to full width and takes only the height required by its aspect ratio, capped at 45% of the viewport; everything below it is the game panel (guess strip, hint-area placeholder, and input). In landscape and on desktop the map keeps its Phase 1 behavior, fitted to the available area, with the game panel as a fixed-height bottom bar. The autocomplete input is always anchored to the bottom of the viewport so it remains above the mobile keyboard; use `100dvh` and test iOS-style keyboard opening by shrinking the viewport height.

Autocomplete input, normalization, guess state, color buckets from the matrix, on-map labels (name + km, collision-avoided by nudging along the centroid or falling back to a leader line for tiny bairros), "encosta" state, win state, "novo jogo" button, choice between "conhecidos" and "todos". Pure logic in `src/game/` with Vitest tests. Colorblind check.

Phase 2 was delivered as two stacked PRs: 2a added the game logic, autocomplete, controls, responsive panel, and map coloring; 2b made the map the guess log. A 2c follow-up contains the playtest fixes and is stacked with Phase 2.5 in a second two-PR delivery.

Acceptance: a full practice game is playable on desktop and phone; tests cover normalization edge cases (accents, parentheses, "São" vs "Sao"), color bucketing boundaries, and win detection; no layout shift when labels appear.

### Phase 2.5 — Hints and explainer (agent, ~1.5h)

Hint button with three static tiers, penalties applied in state, hint text shown as a card above the input, and a data-built post-win placeholder. The generated explainer and its Supabase fetch/cache are deferred to Phase 3.

Acceptance: hint order, cap, and score arithmetic are tested; all three tiers remain clear of the input at 360×640; no runtime network request.

### Phase 3 — Daily mode and leaderboard (agent, ~4h, likely two PRs)

Supabase migrations and the two Edge Functions, plus the generated bairro explainer fetch/cache deferred from Phase 2.5. Daily puzzle number computed from a fixed epoch date in America/Sao_Paulo. Client flow: fetch `daily`, play against the hash, submit on win, show rank. Nickname prompt at first submission. Local persistence of daily state so a refresh does not reset the game. Share button producing the text above (Web Share API on mobile, clipboard fallback). Streak and simple stats in localStorage.

Acceptance: two devices see the same daily; the answer is not recoverable from the bundle or the network tab before winning; a submitted result with an impossible guess sequence is rejected; leaderboard shows top 50 and own rank; explainers are cached after the first request and fail without a permanent spinner.

### Phase 4 — Polish and ship (agent + human, ~2h)

EN toggle (strings file, two languages), consent banner and GA4 events (game_start, guess, hint_used, win, share), favicon and OG image, footer with attribution and link to mvergara.net, domain, deploy. Cross-check on iOS Safari for input focus and viewport height quirks.

Acceptance: production URL live; share preview renders correctly on WhatsApp; Consent Mode v2 verified in GA4 DebugView.

### Phase 5 — Portfolio wrap (human, ~1h)

README with a GIF, an ADR-style note on the offline hint pipeline decision, a `/api/status` endpoint or a Supabase view for the Mission Control dashboard, LinkedIn post (PT-BR).

## 5. Working agreement with the agent

The agent gets this document plus the phase prompt, nothing else. Small PRs, conventional commits, no new dependencies without listing them in the PR description with a one-line reason. Any deviation from Section 2 must be raised as a question, not implemented. If a step is ambiguous, prefer the simplest interpretation and note it in the PR.
