# fsd_esg — ESG Report Automation for SMEs

Enter company data, compute the ESG metrics, draft the report with AI,
export a PDF. Structured against **India's BRSR** (SEBI format, nine
NGRBC principles) and the **EU's CSRD/ESRS**.

## Layout

```
fsd_esg/
├── frontend/     React + TypeScript web app   ← built, runs today
└── (backend)     Python + MySQL               ← to come
```

## frontend/

A complete web app: dashboard, data entry, compliance mapping, AI report
drafting, and an assistant that answers from the company's own figures.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

It runs standalone on bundled demo data, so it works before any backend
exists. See **[frontend/README.md](frontend/README.md)** for the full
tour and deployment options (Netlify, Vercel, Docker, GitHub Pages).

## Backend (planned)

Per the project outline, Python modules with one job each:

| Module | Job |
|---|---|
| `database.py` | MySQL read/write |
| `calculator.py` | ESG formulas |
| `ai_service.py` | Talks to the AI API |
| `pdf_service.py` | Builds the PDF |

A thin FastAPI layer exposes these over HTTP; the frontend then switches
from demo data to live data with one environment variable.
**[frontend/BACKEND.md](frontend/BACKEND.md)** maps every endpoint the
frontend expects to the module that should serve it, with the exact
request and response shapes.

Two contracts worth reading before writing the backend:

- A metric that hasn't been entered must be **`null`, never `0`**. The
  gap detection and compliance screens depend on that distinction — an
  unmeasured figure and a measured zero are different claims.
- `frontend/src/data/metrics.ts` is the canonical metric catalogue. The
  `key` of each entry is what the API payloads and the MySQL
  `esg_data.metric_name` column should both use.

## Emission factors

The grid factor defaults to **0.727 kg CO₂e/kWh** — the CEA weighted
average for FY 2023-24. The widely-quoted 0.82 is the FY 2015-16 figure
and is out of date. Factors are overridable in the app's Settings, and
each carries its source and vintage so results stay reproducible.

## Scope and limitations

Stated plainly, because an ESG tool that overstates its coverage is
worse than no tool:

- Scope 3 (value-chain) emissions are not calculated.
- Scope 2 is location-based only.
- Readiness percentages count only disclosures backed by a numeric
  metric; the rest are reported separately as needing narrative, so the
  headline figure cannot overstate how finished a report is.
- No double-materiality assessment, which is what decides whether an
  ESRS topical standard applies to you at all.
- Nothing here is assurance. Figures need review before any filing.

Framework details were checked against public sources, but scope
thresholds and assurance timelines under both regimes have been amended
more than once. Verify against the live SEBI circular or current ESRS
text before relying on a date.

## A note on secrets

This repository is public. The AI API key belongs in the backend's
`.env` (git-ignored), never in the frontend: any variable prefixed
`VITE_` is compiled into the JavaScript bundle and readable by anyone
who opens the page.
