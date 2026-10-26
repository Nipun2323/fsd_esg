# Verdant ESG — frontend

ESG reporting for SMEs, structured against **India's BRSR** and the
**EU's CSRD/ESRS**. Enter your figures, see what the regulations still
want from you, let the assistant draft the narrative, review it, export.

Runs standalone on bundled demo data. Point one environment variable at
the Python backend and it's live.

```bash
npm install
npm run dev          # http://localhost:5173
```

## What's here

| Page | Does |
|---|---|
| **Dashboard** | Headline metrics with year-on-year deltas, emissions and energy trends, every derived figure with the basis it was calculated from |
| **Data entry** | Forms per pillar, CSV import with a downloadable template, progress per pillar |
| **Compliance** | Disclosure-by-disclosure mapping for BRSR (Sections A/B/C, nine NGRBC principles, essential vs leadership) and CSRD (all 12 ESRS) |
| **Report** | Section-by-section AI drafting, editable before export, with the figures each draft used listed underneath |
| **Companies** | Multiple reporting entities |
| **Settings** | Emission factors with sources and overrides; backend connection; stated limitations |

The **assistant** is reachable from every page and answers from the
selected company's own saved figures.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind 4 · Recharts 3 ·
React Router 7. No state library — one context, because the state is
genuinely small.

## Connecting the backend

```bash
cp .env.example .env
```

```bash
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000
```

Every call goes through `EsgApi` in `src/api/types.ts`. Swapping the
flag swaps the implementation and nothing else.
**[`BACKEND.md`](BACKEND.md)** maps each endpoint to the Python module
from the project outline that should answer it.

> Never put a model API key in a `VITE_` variable. Vite compiles those
> into the JavaScript bundle, where anyone can read them. Keys belong on
> the server.

## Deploying

**Vercel / Netlify** — connect the repo. `vercel.json` and
`netlify.toml` are configured (SPA rewrites, immutable asset caching).
Set `VITE_USE_MOCK` and `VITE_API_BASE_URL` in the dashboard.

**Docker** — any VPS, Cloud Run, App Runner, ECS, Azure Container Apps:

```bash
docker build -t esg-frontend \
  --build-arg VITE_USE_MOCK=false \
  --build-arg VITE_API_BASE_URL=https://api.example.com .
docker run -p 8080:80 esg-frontend
```

Multi-stage build, nginx, gzip, hashed assets cached for a year,
`index.html` never cached, SPA fallback, health check.

**Whole stack** — `docker-compose.yml` brings up frontend + backend +
MySQL. Uncomment the `/api/` proxy block in `nginx.conf` to serve both
from one origin, which removes the need for CORS.

**GitHub Pages** — Pages has no SPA fallback, so build with hash
routing:

```bash
npm run build:pages          # URLs become /#/compliance
```

For a project site (`user.github.io/repo`), also set the base path:

```bash
VITE_BASE=/your-repo-name/ npm run build:pages
```

`VITE_*` values are baked in at **build** time, not read at runtime — a
change means a rebuild.

### Build-time options

| Variable | Values | Does |
|---|---|---|
| `VITE_USE_MOCK` | `true` (default) / `false` | Demo data vs real backend |
| `VITE_API_BASE_URL` | URL | Backend origin, when mock is off |
| `VITE_ROUTER` | `browser` (default) / `hash` / `memory` | `hash` for hosts without SPA fallback; `memory` for embedded previews that can't own the address bar |
| `VITE_BASE` | path | Asset base for subpath hosting |

## Structure

```
src/
  api/        client.ts (the switch) · types.ts (the contract)
              mock.ts · http.ts · mockData.ts
  components/ Layout · Assistant · Charts · ui
  data/       frameworks.ts (BRSR + ESRS) · metrics.ts (catalogue + factors)
  lib/        calculator.ts · compliance.ts · store.tsx
  pages/      Dashboard · DataEntry · Compliance · ReportBuilder
              Companies · Settings
```

`src/data/` is the part to edit when the regulations move. Framework
definitions and the metric catalogue are data, not code, and the
compliance screen is generated from them.

## What this does not do

Stated plainly, because an ESG tool that overstates its coverage is
worse than no tool:

- **Scope 3 is not calculated.** For many SMEs value-chain emissions are
  the majority of the footprint.
- **Scope 2 is location-based only.** A market-based figure needs
  contractual instrument data that isn't collected here.
- **Readiness percentages cover numeric metrics only.** Both BRSR and
  the ESRS also require narrative, policy and process disclosures. The
  compliance page counts those separately as "needs narrative" rather
  than quietly leaving them out of the denominator.
- **No double-materiality assessment.** Which ESRS topical standards
  apply to you depends on one, so every topical standard shows as
  conditional.
- **Not assurance.** Figures need review by a competent person before
  they go near a filing.

Framework details here were checked against public sources, but scope
thresholds and assurance timelines under both regimes have been amended
more than once. Verify against the live SEBI circular or the current
ESRS text before relying on a date.

## Accessibility and theming

Light and dark are separately specified, not an inverted filter. Chart
colours are drawn from a palette validated for colour-vision deficiency
against both surfaces; every chart carries a legend, direct value
labels and a table view, so nothing is encoded by colour alone. Adding a
fourth chart series means re-validating the palette.
