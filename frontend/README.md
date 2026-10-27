# Verdant ESG — frontend

ESG reporting for SMEs, structured against **India's BRSR** and the
**EU's CSRD/ESRS**. Enter your figures, see what the regulations still
want from you, let the assistant draft the narrative, review it, export.

Requires the FastAPI backend in `../backend` — there is no demo data
any more, the companies come from the imported ratings dataset.

```bash
npm install
cp .env.example .env     # VITE_API_BASE_URL=http://localhost:8000
npm run dev              # http://localhost:5173
```

Sign in with **`Admin` / `12345`**.

## What's here

| Page | Does |
|---|---|
| **Login** | Sign in or create a company account. Default `Admin` / `12345` |
| **Dashboard** | Third-party rating with industry benchmark; after a report is uploaded, headline metrics, year-on-year deltas and trend charts |
| **Upload report** | Drop a PDF, spreadsheet or text report; the backend extracts the ESG figures from it |
| **Data entry** | Forms per pillar, for correcting or completing what was extracted |
| **Compliance** | Disclosure-by-disclosure mapping for BRSR (Sections A/B/C, nine NGRBC principles, essential vs leadership) and CSRD (all 12 ESRS) |
| **Report** | Section-by-section AI drafting, editable before PDF export, with the figures each draft used listed underneath |
| **Settings** | Emission factors with sources; AI status; stated limitations |

The **assistant** is reachable from every page. It resolves the company
from your question — "how is Disney doing on governance?" — and answers
only from that company's saved figures.

Company selection is a type-ahead over hundreds of companies, not a
dropdown. Nothing is fetched until you pick one.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind 4 · Recharts 3 ·
React Router 7. No state library — one context, because the state is
genuinely small.

## Connecting the backend

```bash
cp .env.example .env
```

```ini
VITE_API_BASE_URL=http://localhost:8000
```

Every call goes through `EsgApi` in `src/api/types.ts`, implemented once
in `src/api/http.ts`. The backend's own docs are at
`http://localhost:8000/docs`.

> Never put the Gemini key in a `VITE_` variable. Vite compiles those
> into the JavaScript bundle, where anyone can read them. The key lives
> in `backend/.env`.

## Deploying

**Vercel / Netlify** — connect the repo. `vercel.json` and
`netlify.toml` are configured (SPA rewrites, immutable asset caching).
Set `VITE_API_BASE_URL` in the dashboard to your deployed API.

**Docker** — any VPS, Cloud Run, App Runner, ECS, Azure Container Apps:

```bash
docker build -t esg-frontend \
  --build-arg VITE_API_BASE_URL=https://api.example.com .
docker run -p 8080:80 esg-frontend
```

Multi-stage build, nginx, gzip, hashed assets cached for a year,
`index.html` never cached, SPA fallback, health check.

**Whole stack** — the repo-root `docker-compose.yml` brings up
frontend + API + MySQL together. Uncomment the `/api/` proxy block in
`nginx.conf` to serve both from one origin, which removes the need for
CORS.

Note the frontend is a static bundle, so a host like Netlify serves it
but cannot run the Python API — that needs its own host (Render, Fly,
Railway, a VPS) and `VITE_API_BASE_URL` pointed at it.

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
| `VITE_API_BASE_URL` | URL | Backend origin |
| `VITE_API_TIMEOUT` | ms | Request timeout; model calls are slow |
| `VITE_ROUTER` | `browser` (default) / `hash` / `memory` | `hash` for hosts without SPA fallback; `memory` for embedded previews that can't own the address bar |
| `VITE_BASE` | path | Asset base for subpath hosting |

## Structure

```
src/
  api/        client.ts · types.ts (the contract) · http.ts
  components/ Layout · Assistant · Charts · CompanySearch
              RatingPanel · ui
  data/       frameworks.ts (BRSR + ESRS) · metrics.ts (catalogue + factors)
  lib/        auth.tsx · store.tsx · calculator.ts · compliance.ts
  pages/      Login · Dashboard · Upload · DataEntry
              Compliance · ReportBuilder · Settings
```

`src/data/` is the part to edit when the regulations move. These files
are also the **source** for the backend's copy — after changing them run
`python -m scripts.sync_catalogue` in `backend/` so both halves agree on
metric keys and units.

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
- **The imported dataset has no activity data.** It carries ESG scores
  and grades only, so emissions cannot be derived from it — those come
  from an uploaded report.

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
