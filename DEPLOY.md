# Deploying to AWS, Azure or Google Cloud

This app is two deployables plus a database:

| Piece | What it needs |
|---|---|
| `backend/` | A container host that can run a long-lived HTTP process |
| `frontend/` | Static file hosting — it is a pile of HTML, JS and CSS |
| Database | **Managed. Not SQLite.** See the warning below |

---

## Read this first: SQLite will not survive

The app defaults to SQLite so it runs locally with nothing installed.
On a container platform that is a trap. Cloud Run, Container Apps and
App Runner all give the container an **ephemeral filesystem**: it is
discarded on every deploy, every scale event and every crash restart,
and a second instance gets its own copy.

Deploy as-is and users will register accounts that vanish, upload
reports that disappear, and see different data depending on which
instance answers.

Provision a managed database and set `DATABASE_URL` before going live.
The app speaks SQLite, MySQL and PostgreSQL, and normalises the URL
formats these providers hand you (`postgres://`, `postgresql://`,
`mysql://`).

---

## Recommended: Google Cloud Run

Cheapest and simplest of the three for this shape of app. It scales to
zero, so an idle demo costs nothing but the database. Your Gemini key
is already a Google credential, which keeps everything in one console.

### 1. Database

Cheapest durable option is a free managed Postgres from
[Neon](https://neon.tech) or [Supabase](https://supabase.com) — both
have a free tier that suits coursework. Cloud SQL is the all-Google
option but has no free tier.

Copy the connection string; it looks like
`postgresql://user:pass@host/db`.

### 2. Deploy the backend

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

Put the secrets in Secret Manager rather than in the deploy command,
where they end up in your shell history and the service's config:

```bash
printf 'YOUR_GEMINI_KEY'  | gcloud secrets create gemini-key   --data-file=-
printf 'YOUR_DATABASE_URL' | gcloud secrets create database-url --data-file=-
python -c "import secrets;print(secrets.token_urlsafe(48))" | gcloud secrets create jwt-secret --data-file=-
```

Deploy straight from source — Cloud Build reads `backend/Dockerfile`:

```bash
cd backend
gcloud run deploy fsd-esg-api \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets "GEMINI_API_KEY=gemini-key:latest,DATABASE_URL=database-url:latest,SECRET_KEY=jwt-secret:latest" \
  --set-env-vars "DEFAULT_ADMIN_PASSWORD=pick-something-real,SEED_ON_BOOT=true"
```

`SEED_ON_BOOT=true` imports the 722 companies on first start. **Remove
it after the first successful deploy** — otherwise every new instance
re-runs the import on cold start, which is slow and pointless:

```bash
gcloud run services update fsd-esg-api --region asia-south1 \
  --remove-env-vars SEED_ON_BOOT
```

Note the service URL it prints.

### 3. Deploy the frontend

Any static host works — Netlify, Vercel, Firebase Hosting or a GCS
bucket. Build it pointing at the API:

```bash
cd frontend
VITE_API_BASE_URL=https://fsd-esg-api-xxxx.run.app npm run build
```

Or deploy the build once and set `apiBaseUrl` in `dist/config.js`,
which is read at runtime so the URL can change without a rebuild.

### 4. Let the frontend talk to the API

CORS is enforced by the browser, and the API rejects origins it does
not know:

```bash
gcloud run services update fsd-esg-api --region asia-south1 \
  --set-env-vars "CORS_ORIGINS=https://your-frontend-domain"
```

Miss this and every request fails with a CORS error in the console
while the API itself looks healthy.

---

## Fly.io

`backend/fly.toml` is committed and configured: port 8080, a health
check on `/api/health`, and scale-to-zero so an idle demo costs close
to nothing.

```bash
cd backend
fly launch --no-deploy      # claims the app name, keeps the existing fly.toml
fly postgres create         # or attach your own database
fly postgres attach <name>  # sets DATABASE_URL on the app

fly secrets set \
  GEMINI_API_KEY=your-key \
  SECRET_KEY="$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')" \
  DEFAULT_ADMIN_PASSWORD=pick-something-real

fly deploy
```

Seed the dataset once the app is up, as a one-off rather than on every
boot:

```bash
fly ssh console -C "python -m scripts.import_companies"
```

Then narrow CORS to the frontend's origin:

```bash
fly secrets set CORS_ORIGINS=https://your-frontend-domain
```

Fly's Postgres hands you a `postgres://` URL; the app rewrites it to
the driver it actually installs, so no edit is needed.

> The `fly.toml` here was written from the general shape of Fly's
> configuration, not from their current setup guide — that host is
> blocked from the environment this was built in. The keys used are
> long-standing ones, but check `fly launch`'s output: if it rewrites
> the file, take its version.

---

## Azure

[Container Apps](https://azure.microsoft.com/products/container-apps)
is the equivalent. Azure for Students gives credit without a card,
which can make this the cheapest route if you qualify.

```bash
az login
az group create --name fsd-esg --location centralindia

az containerapp up \
  --name fsd-esg-api \
  --resource-group fsd-esg \
  --location centralindia \
  --source ./backend \
  --ingress external --target-port 8080 \
  --env-vars GEMINI_API_KEY=secretref:gemini-key \
             DATABASE_URL=secretref:database-url \
             SECRET_KEY=secretref:jwt-secret \
             SEED_ON_BOOT=true
```

Database: **Azure Database for PostgreSQL flexible server** (or MySQL —
the app speaks both). Both have a 12-month free offer on a new account.

Frontend: **Azure Static Web Apps**, which is free and has a GitHub
action that builds on push. Set the app location to `frontend` and the
output location to `dist`.

---

## AWS

Workable, but the least generous of the three for a project this size:
App Runner has no free tier and bills from the first hour.

- **Backend** — App Runner, pointed at the GitHub repo or an ECR image.
  Set the port to `8080` and the health check to `/api/health`. ECS
  Fargate is the cheaper, more fiddly alternative.
- **Database** — RDS. A `db.t4g.micro` is free for 12 months on a new
  account; after that it bills.
- **Frontend** — Amplify Hosting, or an S3 bucket behind CloudFront.
- **Secrets** — Secrets Manager or SSM Parameter Store. Parameter Store
  is free for standard parameters; Secrets Manager is not.

---

## Which to pick

| | Backend idle cost | Database free tier | Card needed |
|---|---|---|---|
| **Cloud Run** | Zero — scales to zero | No (use Neon/Supabase) | Yes, for the trial |
| **Container Apps** | Free monthly grant | 12 months | No, with Azure for Students |
| **App Runner** | Billed continuously | 12 months | Yes |

**Cloud Run** if you want the lowest running cost and the least setup.
**Azure** if you have a student account — the credit and the 12-month
database make it effectively free.

Free tiers and prices change. Check the current pricing page before you
commit to one; the figures above are the shape of the offers, not a
quote.

---

## Before you go live

- [ ] `DATABASE_URL` points at a managed database, not SQLite
- [ ] `SECRET_KEY` set to a generated value. Leave it unset and tokens
      are invalidated on every restart, because the default is random
      per process
- [ ] `DEFAULT_ADMIN_PASSWORD` changed from `12345`. The default is in
      this public repository
- [ ] `GEMINI_API_KEY` in the platform's secret store, never in a
      `VITE_` variable — those are compiled into the JavaScript bundle
      and readable by anyone who opens the page
- [ ] `CORS_ORIGINS` lists the deployed frontend's exact origin
- [ ] `SEED_ON_BOOT` removed after the first deploy
- [ ] Health check pointed at `/api/health`

## Checking a deployment

```bash
curl https://your-api-host/api/health
```

```json
{"status":"ok","database":"postgresql","ai":{"enabled":true,"model":"gemini-3.5-flash"}}
```

`database` should name your managed engine, not `sqlite`. `ai.enabled`
should be `true` — if it is `false`, the key did not reach the
container and the app is silently running on deterministic templates.
