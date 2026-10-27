# Backend — Verdant ESG API

FastAPI service behind the React frontend. Authentication, the company
database, report upload with AI extraction, BRSR/CSRD evaluation,
report drafting, PDF export, and the chatbot.

## Run it

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                 # then edit it, see below
python -m scripts.import_companies   # loads data/companies.csv
uvicorn app.main:app --reload
```

API on <http://localhost:8000>, interactive docs at
<http://localhost:8000/docs>.

**Default login: `Admin` / `12345`** — seeded on first start. These are
development credentials. Change `DEFAULT_ADMIN_PASSWORD` in `.env`
before this is reachable from anywhere but your own machine.

## Configuration

| Variable | Default | Does |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./esg.db` | SQLite needs nothing installed. For MySQL: `mysql+pymysql://user:pass@localhost:3306/esg` |
| `SECRET_KEY` | dev placeholder | Signs JWTs. Generate: `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `GEMINI_API_KEY` | empty | Free key from [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | |
| `DEFAULT_ADMIN_USERNAME` / `_PASSWORD` | `Admin` / `12345` | Seeded once, on an empty database |
| `CORS_ORIGINS` | localhost:5173, :4173 | Comma-separated |
| `MAX_UPLOAD_MB` | `20` | |

### Without a Gemini key

The app runs. Every AI endpoint falls back to a deterministic path and
flags itself with `usedAi: false`, which the UI shows:

- **Extraction** → regex patterns. Finds much less than the model and is
  easier to fool.
- **Report drafting** → templates over the real figures.
- **Chatbot** → keyword routing over the real figures.

Nothing in either path can invent a number. The fallbacks are templates
over values already in the database; the model prompts pass the figures
in and forbid inventing others.

## Layout

```
backend/
├── app/
│   ├── main.py             FastAPI app, CORS, startup seeding
│   ├── config.py           settings from .env
│   ├── database.py         SQLAlchemy engine (SQLite or MySQL)
│   ├── models.py           7 tables
│   ├── schemas.py          request/response shapes
│   ├── auth.py             bcrypt + JWT
│   ├── catalogue.py        loads data_catalogue.json
│   ├── routers/            auth · companies · uploads · reports · chat · meta
│   └── services/
│       ├── calculator.py        ESG formulas
│       ├── compliance.py        BRSR + CSRD mapping
│       ├── ai_service.py        all Gemini calls
│       ├── fallback_narrative.py  no-key deterministic path
│       ├── extract.py           PDF/XLSX/CSV → text
│       └── pdf_service.py       ReportLab
├── scripts/
│   ├── import_companies.py  load the ratings CSV
│   └── sync_catalogue.py    regenerate the shared catalogue
└── data/companies.csv
```

## The shared catalogue

`app/data_catalogue.json` is **generated** from the frontend's
TypeScript (`frontend/src/data/metrics.ts` and `frameworks.ts`). Metric
keys, units and framework definitions must match on both sides, so the
TypeScript is the single source and this extracts it:

```bash
python -m scripts.sync_catalogue
```

Do not hand-edit the JSON.

## Endpoints

| Method | Path | Does |
|---|---|---|
| `POST` | `/api/auth/signup` | Create a login, optionally linked to a company |
| `POST` | `/api/auth/login` | Returns a JWT |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/companies/search?q=` | Type-ahead. Empty `q` returns `[]` and touches nothing |
| `GET` | `/api/companies/resolve?name=` | Exact-ish lookup by name or ticker |
| `GET` | `/api/companies/{id}/dashboard` | Everything one screen needs, in one call |
| `GET`/`PUT` | `/api/companies/{id}/data?year=` | Activity metrics |
| `POST` | `/api/uploads` | Upload a report; extracts metrics and merges them |
| `GET` | `/api/reports?companyId=&year=&framework=` | Get or create |
| `POST` | `/api/reports/{id}/sections/{key}/generate` | Draft one section |
| `PUT` | `/api/reports/{id}/sections/{key}` | Save a human edit |
| `POST` | `/api/reports/{id}/export` | PDF |
| `POST` | `/api/assistant/chat` | Chatbot; resolves the company from the question |
| `GET` | `/api/meta/metrics` · `/frameworks` · `/ai` | Catalogue and AI status |

Everything except `/api/health` and the two auth entry points requires a
bearer token. A company login reaches only its own company; the admin
reaches all.

## Importing data

```bash
python -m scripts.import_companies [path/to/file.csv]
```

Idempotent — re-running updates rows rather than duplicating them. Two
layouts are auto-detected:

- **graded** — `ticker,name,…,environment_score,social_score,governance_score,…`
  (the bundled `data/companies.csv`, 722 companies)
- **risk** — semicolon-delimited, with `esg`, `Controversies.*`, `sdg.*`

Percentiles are computed across the imported set at import time, which
is what makes the three pillar scores comparable — they sit on
different raw scales.

## What the ratings data is not

The imported dataset carries **scores and grades, not activity data**.
There is no electricity, fuel, water, waste or headcount in it, so no
emissions can be derived from it. Those figures come from a report
uploaded against a company, or from manual entry.

This is why a company shows a ratings view until someone uploads its
report, and the full emissions dashboard afterwards.

## Data handling

A metric that was not reported is **absent**, never `0`. An unmeasured
figure and a measured zero are different claims, and the gap detection,
the compliance coverage figure and the report drafting all depend on
the distinction. The save endpoint drops nulls rather than coercing
them.

## MySQL

```sql
CREATE DATABASE esg CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'esg'@'localhost' IDENTIFIED BY 'yourpassword';
GRANT ALL PRIVILEGES ON esg.* TO 'esg'@'localhost';
```

```ini
DATABASE_URL=mysql+pymysql://esg:yourpassword@localhost:3306/esg
```

Tables are created on startup. Re-run the import afterwards.
