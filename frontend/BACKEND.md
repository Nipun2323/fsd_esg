# Wiring this frontend to the Python backend

The frontend talks to exactly one interface: `EsgApi` in
[`src/api/types.ts`](src/api/types.ts). There are two implementations —
`mock.ts` (bundled demo data) and `http.ts` (real HTTP) — and
`src/api/client.ts` picks between them from one environment variable.

To go live:

```bash
# .env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000
```

Nothing else in the app changes.

## Endpoint contract

Your outline splits the Python into `database.py`, `calculator.py`,
`ai_service.py` and `pdf_service.py`. Those stay exactly as they are —
a thin FastAPI layer calls them. The column on the right says which of
your modules should answer each route.

| Method | Path | Serves | Python module |
|---|---|---|---|
| `GET` | `/companies` | Company picker | `database.py` |
| `POST` | `/companies` | Create entity | `database.py` |
| `GET` | `/companies/{id}/data?year=` | Load a year's figures | `database.py` |
| `PUT` | `/companies/{id}/data?year=` | Save the data-entry form | `database.py` |
| `POST` | `/companies/{id}/data/import?year=` | CSV upload (multipart `file`) | `database.py` |
| `GET` | `/companies/{id}/reports?year=&framework=` | Load or create a report | `database.py` |
| `POST` | `/reports/{id}/sections/{key}/generate` | Draft one section | `ai_service.py` |
| `PUT` | `/reports/{id}/sections/{key}` | Persist a human edit | `database.py` |
| `POST` | `/reports/{id}/export` | PDF bytes | `pdf_service.py` |
| `POST` | `/assistant/chat` | Grounded Q&A | `ai_service.py` |

`{key}` is one of `executive_summary`, `environmental`, `social`,
`governance`, `recommendations`.

## Response shapes

TypeScript interfaces in [`src/types/index.ts`](src/types/index.ts) are
the source of truth. The two that matter most:

```jsonc
// GET /companies/1/data?year=2025
{
  "companyId": 1,
  "year": 2025,
  "values": { "electricity_kwh": 731200, "water_kl": 26400, "board_size": 7 }
}
```

A metric that has not been entered must be **absent or `null`**, never
`0`. The whole gap-detection and compliance layer depends on that
distinction — a reported zero and an unreported figure are different
claims.

```jsonc
// POST /reports/4/sections/environmental/generate
{
  "body": "Scope 1 emissions were 42.62 tCO2e…",
  "groundedIn": ["scope1", "scope2", "renewableShare"],
  "generatedAt": "2026-10-26T09:14:00Z"
}
```

`groundedIn` holds the metric keys the draft used. The UI renders them
under each section so a reviewer can see what the text was built from.
Returning an empty array is allowed but weakens the review step.

## Metric keys

`src/data/metrics.ts` is the canonical catalogue. Each entry's `key` is
what both the API payloads and the CSV import use, so your MySQL
`esg_data.metric_name` column should store exactly these strings.

The `mapsTo` array on each metric is what drives the compliance screen.
If you add a metric in Python, add it here too or it will not appear in
any disclosure mapping.

## Calculations

`src/lib/calculator.ts` mirrors what `calculator.py` should do, and is
written dependency-free so it ports almost line for line. Two choices
worth copying deliberately:

- **Scope 2 is location-based**: `kWh × grid factor ÷ 1000` → tCO₂e.
- **LTIFR** is injuries per *one million* hours worked.

Emission factors live in `src/data/metrics.ts` with their source and
vintage attached, and users can override them in Settings. If the
backend becomes authoritative for factors, return them with the dataset
and drop the client-side defaults.

> The grid factor defaults to **0.727 kg CO₂e/kWh** (CEA weighted
> average, FY 2023-24). The 0.82 figure in the original project outline
> is the FY 2015-16 value and is out of date.

## CORS

The browser calls the API directly, so FastAPI needs:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],   # add your deployed origin
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Or avoid CORS entirely by serving both behind one origin — the nginx
config in this repo has a commented `/api/` proxy block for that, and
`docker-compose.yml` wires it up.

## The AI calls

Two routes hit the model, and both should keep the discipline the
outline already sets out:

- **`/generate`** — one section per call, with the real figures passed
  in and an explicit instruction not to invent any. Short calls are
  easier to check and cheaper to retry.
- **`/assistant/chat`** — answer only from the company's saved numbers.
  When a figure is missing, say so rather than estimating. The mock
  implementation in `src/api/mock.ts` shows the behaviour the UI
  expects, including the `citations` field.

Keep the API key in `.env` on the server. It must never reach the
frontend: anything in a `VITE_`-prefixed variable is compiled into the
JavaScript bundle and is readable by anyone who opens the page.
