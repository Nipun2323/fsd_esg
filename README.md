<div align="center">

# Verdant ESG

**ESG reporting automation for small and medium enterprises**

Sign in, pick a company, upload its report. Gemini extracts the ESG figures,
the backend computes the metrics and maps them onto the disclosure
requirements, and you get an editable report and a PDF.

Aligned to **India's BRSR** (SEBI format) and the **EU's CSRD / ESRS**.

<br>

![React](https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06b6d4?logo=tailwindcss&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.13-3776ab?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.162-009688?logo=fastapi&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL_%2F_SQLite-4479a1?logo=mysql&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-8e75b2?logo=googlegemini&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
[![Live demo](https://img.shields.io/badge/Live_demo-fsd--esg.netlify.app-00c7b7?logo=netlify&logoColor=white)](https://fsd-esg.netlify.app)

### [→ Open the live app](https://fsd-esg.netlify.app)

<sub>Running on bundled demo data — no sign-in, no setup.</sub>

</div>

<br>

<a href="https://fsd-esg.netlify.app"><img src="docs/screenshots/dashboard.png" alt="Dashboard"></a>

---

## Contents

- [The problem](#the-problem)
- [Features](#features)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Backend contract](#backend-contract)
- [Methodology](#methodology)
- [Scope and limitations](#scope-and-limitations)
- [Work split](#work-split)
- [License](#license)

---

## The problem

Sustainability reporting is now mandatory for a widening set of companies —
SEBI's BRSR in India, the CSRD in the EU. Large firms hire consultants. SMEs
mostly have a spreadsheet, a deadline, and no idea which of several hundred
disclosure points actually apply to them.

This tool closes that gap: structured data entry, automatic calculation with
cited emission factors, an explicit map of what each framework still wants, and
a drafted narrative grounded in the company's own numbers.

---

## Features

| | |
|---|---|
| **Authentication** | JWT login and company sign-up. A company account sees only its own data; the admin sees all |
| **722 companies** | Imported ESG ratings dataset, searchable by name or ticker |
| **Report upload** | Drop a PDF, spreadsheet or text report. Gemini extracts the ESG figures and merges them into that company's year |
| **Dashboard** | Third-party rating with industry benchmark, then headline metrics, year-on-year change and trends once a report is uploaded |
| **Compliance** | Disclosure-by-disclosure mapping. BRSR Sections A/B/C across the nine NGRBC principles, essential and leadership tiers separated; all twelve ESRS for CSRD |
| **Report builder** | Gemini drafts each section from the real figures, fully editable, exported as a PDF |
| **AI chatbot** | Resolves the company from your question and answers only from its saved figures |

Plus: light and dark themes, keyboard-accessible throughout, a table view behind
every chart, and charts validated for colour-vision deficiency.

**Default login: `Admin` / `12345`.**

---

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/screenshots/compliance.png" alt="Compliance mapping"><br><em>BRSR readiness, disclosure by disclosure</em></td>
<td width="50%"><img src="docs/screenshots/report.png" alt="Report builder"><br><em>AI drafts, editable before export</em></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/assistant.png" alt="AI assistant"><br><em>Assistant, grounded in saved figures</em></td>
<td width="50%"><img src="docs/screenshots/data-entry.png" alt="Data entry"><br><em>Data entry by pillar, with CSV import</em></td>
</tr>
</table>

<details>
<summary><strong>Dark theme</strong></summary>
<br>

![Dashboard in dark theme](docs/screenshots/dashboard-dark.png)

</details>

---

## Quick start

**Requirements:** Python 3.11+ and Node.js 20+.

```bash
git clone https://github.com/Nipun2323/fsd_esg.git
cd fsd_esg
```

**Terminal 1 — backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python -m scripts.import_companies                   # loads 722 companies
uvicorn app.main:app --reload                        # http://localhost:8000
```

**Terminal 2 — frontend**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                                          # http://localhost:5173
```

Sign in with **`Admin` / `12345`**, search for a company, upload a report.

Or the whole stack including MySQL:

```bash
docker compose up --build        # frontend :8080, API :8000
```

### Enabling Gemini

Free key from [aistudio.google.com](https://aistudio.google.com/app/apikey),
then in `backend/.env`:

```ini
GEMINI_API_KEY=your-key-here
```

Without it everything still runs: extraction falls back to pattern
matching, drafting and the chatbot to deterministic templates over the
same figures. Each response is flagged so the UI can say which produced
it. Neither path can invent a number.

---

## Architecture

```
┌───────────────────────────────────────────────┐
│  React frontend                               │
│  login · dashboard · upload · compliance      │
│  report builder · assistant                   │
└────────────────────┬──────────────────────────┘
                     │  EsgApi — one typed interface
                     ▼  JWT-authenticated REST
┌───────────────────────────────────────────────┐
│  FastAPI                                      │
│  auth · companies · uploads · reports · chat  │
└──┬────────────┬───────────┬───────────┬───────┘
   ▼            ▼           ▼           ▼
 models    calculator   compliance  ai_service ──► Gemini
   │        (metrics)   (BRSR/ESRS)      │          │
   ▼                                     ▼          ▼ no key
SQLite /                           pdf_service   fallback_narrative
 MySQL                              (ReportLab)   (deterministic)
```

Every frontend call goes through
[`frontend/src/api/types.ts`](frontend/src/api/types.ts). Every model
call goes through
[`backend/app/services/ai_service.py`](backend/app/services/ai_service.py),
which falls back to deterministic templates when no key is set.

The metric catalogue and framework definitions live in the frontend's
TypeScript and are **generated** into the backend's
`app/data_catalogue.json` by `scripts/sync_catalogue.py`, so the two
halves cannot drift apart on metric keys or units.

---

## Project structure

```
fsd_esg/
├── backend/               FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── main.py        app, CORS, startup seeding
│   │   ├── models.py      7 tables
│   │   ├── auth.py        bcrypt + JWT
│   │   ├── routers/       auth · companies · uploads · reports · chat · meta
│   │   └── services/      calculator · compliance · ai_service
│   │                      fallback_narrative · extract · pdf_service
│   ├── scripts/           import_companies · sync_catalogue
│   ├── data/companies.csv 722 companies
│   └── README.md
├── frontend/              React + TypeScript
│   ├── src/
│   │   ├── api/           types.ts (the contract) · http.ts
│   │   ├── components/    Layout · Assistant · Charts · CompanySearch
│   │   ├── data/          frameworks.ts · metrics.ts  ← source of truth
│   │   ├── lib/           auth.tsx · store.tsx · calculator · compliance
│   │   └── pages/         Login · Dashboard · Upload · DataEntry
│   │                      Compliance · ReportBuilder · Settings
│   └── README.md
├── docker-compose.yml     frontend + API + MySQL
└── docs/screenshots/
```

---

## Deployment

| Target | Notes |
|---|---|
| **Netlify** | **In use — [fsd-esg.netlify.app](https://fsd-esg.netlify.app)**. Base directory `frontend`, publish `frontend/dist`. `netlify.toml` included; pushes to `main` redeploy automatically |
| **Vercel** | Root directory `frontend`. `vercel.json` included |
| **Docker** | Multi-stage build behind nginx. `Dockerfile` + `docker-compose.yml` included |
| **GitHub Pages** | `npm run build:pages` (hash routing, since Pages has no SPA fallback) |

`docker-compose.yml` brings up frontend, backend and MySQL together, with a
commented nginx proxy block that serves the API from the same origin and
removes the need for CORS.

> **Note** — variables prefixed `VITE_` are compiled into the JavaScript bundle
> at build time. They are readable by anyone who opens the page, and changing
> one requires a rebuild. The AI API key belongs in the backend's `.env`, never
> here.

---

## The data, and what it is not

The bundled dataset is **722 companies with ESG scores and grades** —
environment, social, governance and total, each with a letter grade and
a percentile computed across the set at import time.

It contains **no activity data**: no electricity, fuel, water, waste or
headcount. Emissions cannot be derived from it. That is why a company
shows a ratings view until someone uploads its report, and the full
emissions dashboard afterwards.

Importing is idempotent and auto-detects two CSV layouts:

```bash
cd backend && python -m scripts.import_companies [path/to/file.csv]
```

**A metric that was not reported is absent, never `0`.** An unmeasured
figure and a measured zero are different claims; the gap detection, the
coverage figure and the drafting all depend on the distinction.

---

## Methodology

**Emission factors** carry their source and vintage, and are overridable in the
app's Settings so results stay reproducible.

The grid factor defaults to **0.727 kg CO₂e/kWh** — the CEA weighted average for
FY 2023-24. The widely-quoted 0.82 is the FY 2015-16 figure; India's grid has
decarbonised since, and using it would overstate emissions by roughly 13%.

**Calculations** live in
[`frontend/src/lib/calculator.ts`](frontend/src/lib/calculator.ts), written
dependency-free so they port to `calculator.py` directly. Scope 2 is
`kWh × grid factor ÷ 1000` → tCO₂e, location-based. LTIFR is injuries per one
million hours worked.

**Readiness percentages** count only disclosures backed by a numeric metric.
Disclosures requiring narrative are reported separately rather than dropped from
the denominator, so the headline figure cannot overstate how finished a report
is.

---

## Scope and limitations

Stated plainly, because an ESG tool that overstates its coverage is worse than
no tool at all.

- **Scope 3 is not calculated.** For many SMEs, value-chain emissions are the
  majority of the footprint.
- **Scope 2 is location-based only.** A market-based figure requires contractual
  instrument data this tool does not collect.
- **Readiness covers numeric metrics only.** Both BRSR and the ESRS also require
  narrative, policy and process disclosures.
- **No double-materiality assessment.** That assessment is what determines
  whether an ESRS topical standard applies at all, so every topical standard is
  shown as conditional.
- **This is not assurance.** Figures need review by a competent person before
  any filing.

Framework details were checked against public sources. Scope thresholds and
assurance timelines under both regimes have been amended more than once —
verify against the live SEBI circular or current ESRS text before relying on a
date.

---

## Work split

| Area | Files |
|---|---|
| Frontend | `frontend/src/pages`, `frontend/src/components` |
| Database | `database.py`, MySQL schema |
| Calculations & PDF | `calculator.py`, `pdf_service.py` |
| AI integration | `ai_service.py`, prompts |

Each module has one job, so the work parallelises without collisions.

---

## License

Released under the [MIT License](LICENSE) — use, modify and distribute freely,
including commercially, provided the copyright notice and licence text travel
with the code. The software is provided as is, without warranty.
