# Architecture and technology choices

Reference for the team and for anyone reviewing the project. Covers
what each piece is, how the pieces connect, why each was chosen over
the alternative, and the details that are easy to get wrong.

---

## 1. The stack

### Frontend — `frontend/`, ~4,960 lines TypeScript

| Technology | Version | Role | Why this one |
|---|---|---|---|
| **TypeScript** | 5.9.3 | Whole app, strict mode | The metric catalogue has 28 keys that must match the backend exactly. A typo in `electricity_kwh` is a compile error here and a silent wrong number in plain JS |
| **React** | 19.3.1 | UI | Function components and hooks only. No class components |
| **Vite** | 8.3.5 | Build and dev server | Sub-second hot reload. Bundles with Rolldown, the Rust bundler Vite 8 ships |
| **Tailwind CSS** | 4.3.3 | Styling | v4 is CSS-first: design tokens live in `src/index.css` as custom properties, which is what makes the dark theme a token swap rather than a second stylesheet |
| **React Router** | 7.18.4 | Routing, 7 pages | Strategy switchable at build time: browser, hash or memory |
| **Recharts** | 3.10.1 | Charts | Declarative and React-native. Charting in D3 directly would have been more code for no gain here |
| **lucide-react** | 1.61.0 | Icons | Tree-shakeable; only the icons used ship |

**State: React Context plus hooks.** No Redux, Zustand or TanStack
Query. Two contexts — `AuthProvider` for the session, `AppProvider` for
the selected company, year and framework. The state is genuinely small;
a state library would be more ceremony than the problem needs.

### Backend — `backend/`, ~4,200 lines Python

| Technology | Version | Role | Why this one |
|---|---|---|---|
| **Python** | 3.13 | Language | What the project outline specified |
| **FastAPI** | 0.162.0 | Web framework | Pydantic validation and OpenAPI docs generated from the type hints. `/docs` is a live, interactive API console, which is worth a lot in a demo |
| **SQLAlchemy** | 2.1.6 | ORM | One codebase over SQLite, MySQL and PostgreSQL. The engine is a connection-string change, not a rewrite |
| **Pydantic** | 2.14.1 | Validation | Rejects malformed requests before they reach a handler |
| **PyJWT + bcrypt** | 2.15.1 / 5.0.0 | Auth | Chosen over `passlib`, which has known friction with bcrypt 5 on Python 3.13 |
| **google-genai** | 2.33.0 | Gemini | The current SDK. `google-generativeai` is deprecated and prints an end-of-support warning on import |
| **ReportLab** | 5.1.0 | PDF | What the outline specified. Vector output, no headless browser needed |
| **pypdf / openpyxl** | 6.21.2 / 3.1.5 | Reading uploads | Pull text out of PDF and Excel reports |

### Database

**SQLite** locally, **PostgreSQL or MySQL** in production, same code.
Seven tables:

```
users ──────────┐
                ├──> companies ──┬──> company_ratings   (imported ESG scores)
chat_turns ─────┘                ├──> esg_datasets      (activity data, per year)
                                 ├──> uploads           (files + what was extracted)
                                 └──> reports           (narrative sections as JSON)
```

---

## 2. How it connects

```
Browser
  │
  │  1. POST /api/auth/login  ──────────────>  JWT, stored in localStorage
  │  2. Every later request carries  Authorization: Bearer <token>
  ▼
React (Vite static bundle)
  │
  │  All calls go through ONE interface: src/api/types.ts
  │  Implemented once in src/api/http.ts
  ▼
FastAPI  ── CORS: only origins in CORS_ORIGINS are answered
  │
  ├── auth.py        bcrypt verify, JWT issue, per-company access check
  ├── companies.py   search, dashboard (one call per screen)
  ├── uploads.py     file ──> extract.py ──> ai_service.py ──> esg_datasets
  ├── reports.py     generate ──> ai_service.py;  export ──> pdf_service.py
  └── chat.py        resolve company from the question, then ai_service.py
        │
        ├──> calculator.py    pure functions, no DB
        ├──> compliance.py    pure functions, no DB
        │
        └──> ai_service.py ──> Gemini  (google-genai)
                   │  on 429 / 404 / 503 / timeout
                   └──> fallback_narrative.py  (deterministic templates)
        │
        ▼
   SQLAlchemy ──> SQLite / PostgreSQL / MySQL
```

### The upload path, end to end

1. Browser posts the file to `POST /api/uploads` as multipart
2. `extract.py` turns PDF / XLSX / CSV / TXT into plain text
3. `ai_service.extract_metrics()` sends that text to Gemini with a
   prompt that forbids inventing figures and names the exact metric
   keys and units allowed
4. The JSON that comes back is **validated against the catalogue** —
   unknown keys dropped, non-numeric values dropped, booleans coerced
   to 0/1
5. Accepted values are merged into `esg_datasets` for that company-year
6. The dashboard recomputes on the next request

No key configured, or the model fails? Step 3 falls back to regex
patterns, and the response is flagged `usedAi: false` so the UI can
label it honestly.

---

## 3. The three seams that matter

These are the design decisions worth defending in a viva.

### One typed API contract

`frontend/src/api/types.ts` declares every endpoint the frontend uses.
`http.ts` is the only implementation. No component knows how data
arrives, so the transport can change without touching a screen.

### The catalogue is single-sourced and generated

Metric keys, units and framework definitions live in the frontend's
TypeScript. `backend/scripts/sync_catalogue.py` **generates**
`backend/app/data_catalogue.json` from them.

Why it matters: the frontend and backend both compute ESG metrics. Two
hand-maintained copies would drift, and the symptom would be a figure
that differs between the screen and the PDF — the kind of bug nobody
notices until someone checks. Generating one from the other makes
drift impossible.

Verified: the Python calculator and the TypeScript calculator produce
identical values — 574.2 / 42.62 / 531.58 tCO₂e, LTIFR 5.29.

### The AI has a deterministic floor

Every model call goes through `ai_service.py`, and every one of them
has a non-AI fallback in `fallback_narrative.py`. The app never breaks
because a key is missing, a quota is exhausted or a model is retired.

Crucially, **neither path can invent a number**. The prompts pass real
figures and forbid others; the fallbacks are templates over the same
figures. Every response carries `usedAi`, and the UI labels sections
"AI DRAFT" or "TEMPLATE DRAFT" accordingly.

---

## 4. Why these over the alternatives

**FastAPI instead of Streamlit (the original outline).** Streamlit
couples UI and server — it cannot serve a React frontend, a REST API,
or a mobile client later. The outline itself allowed a JavaScript
frontend "if time remains"; taking that path made FastAPI the natural
server.

**SQLite default, Postgres/MySQL in production.** The outline specified
MySQL, which needs a server installed before anyone can run the project.
SQLAlchemy over SQLite means `git clone && pip install && uvicorn`
works immediately, while one environment variable switches to the real
database. The outline's requirement is met without the setup tax.

**Gemini behind one module.** The outline said the AI was undecided.
Isolating every call in `ai_service.py` means swapping provider touches
one file.

**React Context over a state library.** Two contexts, a handful of
values. Redux here would be more boilerplate than logic.

**Type-ahead search, not a dropdown.** 722 companies in a `<select>` is
unusable. The search also keeps the database idle until a company is
named, which is the behaviour the brief asked for.

---

## 5. Details not to miss

### An unreported metric is absent, never zero

The single most important data rule in the project. A metric with no
value is **omitted from the JSON**, not stored as `0`.

A measured zero ("we had no corruption incidents") and an unmeasured
figure ("we never counted") are different claims. Gap detection,
compliance coverage and the report narrative all depend on telling them
apart. `MySQL esg_data.value FLOAT` would happily accept `0` for both —
the save endpoint drops nulls rather than coercing them.

### The imported dataset has no activity data

`backend/data/companies.csv` is 722 companies with **ESG scores and
grades only** — no electricity, fuel, water, waste or headcount.
Emissions cannot be derived from it.

That is why the dashboard has two states: a ratings view before any
report is uploaded, and the full emissions view after. If someone asks
"why doesn't the dashboard show emissions for every company", this is
the answer.

### Coverage percentages are deliberately narrow

`72% coverage` means: of the mandatory disclosures that **have a
numeric metric behind them**, 72% are satisfied. Disclosures needing
narrative are counted separately as "needs narrative", never dropped
from the denominator.

An earlier version showed 100% while nine mandatory disclosures had no
metric at all. A readiness figure that can reach 100% on an unfinished
report is worse than no figure.

### The grid emission factor

**0.727 kg CO₂e/kWh** — CEA weighted average, FY 2023-24. The widely
quoted **0.82 is the FY 2015-16 figure**; India's grid has decarbonised
since, and using it overstates emissions by roughly 13%. The factor,
its source and its vintage are recorded so a figure can be reproduced.

### Scope 2 is location-based; Scope 3 is not calculated

Scope 2 = `kWh × grid factor ÷ 1000`. A market-based figure would need
contractual instrument data the app does not collect. Scope 3 is out of
scope entirely — and for many SMEs it is the majority of the footprint.
Both are stated in the app and in the PDF rather than left implied.

### `VITE_` variables are public

Vite compiles anything prefixed `VITE_` into the JavaScript bundle.
Readable by anyone who opens the page. **The Gemini key lives in
`backend/.env` only.** This is the easiest way to leak a key on this
stack, and the Vercel/Netlify UIs calling them "environment variables"
makes it look safe.

### SQLite will not survive a container platform

Cloud Run, Render, Container Apps and App Runner all give the container
an ephemeral filesystem. Deploy with SQLite and accounts vanish on
every redeploy, and two instances see different data. Set `DATABASE_URL`
to a managed database before deploying. See `DEPLOY.md`.

### Defaults that must change before going public

| Setting | Default | Why it matters |
|---|---|---|
| `DEFAULT_ADMIN_PASSWORD` | `12345` | Published in this repository |
| `SECRET_KEY` | random per process | Unset means tokens die on restart |
| `CORS_ORIGINS` | localhost | Must list the deployed frontend's exact origin |
| `SEED_ON_BOOT` | `false` | `true` only for a first deploy |

### Known gaps

- **No automated tests and no CI.** Everything was verified manually.
  The highest-value addition would be pytest over `calculator.py` and
  `compliance.py` — pure functions, and every number on screen comes
  from them.
- **MySQL and PostgreSQL paths are unexercised.** The code is
  engine-agnostic and URL normalisation is tested, but only SQLite has
  actually run.
- **The Docker image has never been built.** No daemon was available in
  the environment it was developed in.
- **JWTs last 12 hours with no refresh.** Session simply ends.
- **Uploaded files are not retained** — only the extracted values.

---

## 6. Repository layout

```
fsd_esg/
├── backend/
│   ├── app/
│   │   ├── main.py          FastAPI app, CORS, startup seeding
│   │   ├── config.py        settings, URL normalisation, model chain
│   │   ├── database.py      SQLAlchemy engine
│   │   ├── models.py        7 tables
│   │   ├── schemas.py       request/response shapes
│   │   ├── auth.py          bcrypt + JWT + access checks
│   │   ├── catalogue.py     loads the generated catalogue
│   │   ├── routers/         auth · companies · uploads · reports · chat · meta
│   │   └── services/
│   │       ├── calculator.py          ESG formulas (pure)
│   │       ├── compliance.py          BRSR + CSRD mapping (pure)
│   │       ├── ai_service.py          every Gemini call
│   │       ├── fallback_narrative.py  the no-AI floor
│   │       ├── extract.py             PDF/XLSX/CSV to text
│   │       └── pdf_service.py         ReportLab, 10-page report
│   ├── scripts/             import_companies · sync_catalogue
│   └── data/companies.csv   722 companies
├── frontend/
│   └── src/
│       ├── api/             types.ts (the contract) · http.ts
│       ├── components/      Layout · Assistant · Charts · CompanySearch
│       ├── data/            metrics.ts · frameworks.ts  <- source of truth
│       ├── lib/             auth · store · calculator · compliance
│       └── pages/           Login · Dashboard · Upload · DataEntry
│                            Compliance · ReportBuilder · Settings
├── DEPLOY.md                AWS · Azure · GCP · Render · Fly
├── deploy-gcp.sh            one-command Cloud Run deploy
├── render.yaml  fly.toml  docker-compose.yml
└── ARCHITECTURE.md          this file
```
