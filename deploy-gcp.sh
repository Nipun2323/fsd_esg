#!/usr/bin/env bash
#
# Deploy the backend to Google Cloud Run.
#
# Easiest way to run this: open Cloud Shell (the >_ icon in the Google
# Cloud console), which is already authenticated against your account,
# then:
#
#   git clone https://github.com/Nipun2323/fsd_esg.git
#   cd fsd_esg && ./deploy-gcp.sh
#
# Safe to re-run: secrets are updated rather than duplicated, and the
# service is revised in place.

set -euo pipefail

BOLD=$(tput bold 2>/dev/null || true); DIM=$(tput dim 2>/dev/null || true)
RED=$(tput setaf 1 2>/dev/null || true); GRN=$(tput setaf 2 2>/dev/null || true)
YEL=$(tput setaf 3 2>/dev/null || true); RST=$(tput sgr0 2>/dev/null || true)

say()  { printf '%s\n' "${BOLD}$*${RST}"; }
note() { printf '%s\n' "${DIM}$*${RST}"; }
warn() { printf '%s\n' "${YEL}$*${RST}"; }
die()  { printf '%s\n' "${RED}$*${RST}" >&2; exit 1; }

SERVICE=${SERVICE:-fsd-esg-api}
REGION=${REGION:-asia-south1}

command -v gcloud >/dev/null || die "gcloud not found. Use Cloud Shell, or install the SDK."
[ -f backend/Dockerfile ] || die "Run this from the repository root (backend/Dockerfile not found)."

ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)
[ -n "$ACCOUNT" ] || die "Not logged in. Run: gcloud auth login"
say "Account:  $ACCOUNT"

PROJECT=${PROJECT:-$(gcloud config get-value project 2>/dev/null)}
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  read -rp "Google Cloud project ID: " PROJECT
  [ -n "$PROJECT" ] || die "A project ID is required."
fi
gcloud config set project "$PROJECT" >/dev/null
say "Project:  $PROJECT"
say "Region:   $REGION  ${DIM}(override with REGION=...)${RST}"
echo

# ---------------------------------------------------------------- inputs
note "Leave DATABASE_URL blank only if you are just testing. Cloud Run's"
note "filesystem is ephemeral: with SQLite, every deploy and every new"
note "instance starts from an empty database."
echo
read -rp "DATABASE_URL (postgres:// or mysql://): " DB_URL
read -rsp "GEMINI_API_KEY (hidden, blank = templates only): " GEMINI_KEY; echo
read -rsp "Admin password (hidden, blank = generate): " ADMIN_PW; echo
[ -n "$ADMIN_PW" ] || { ADMIN_PW=$(python3 -c "import secrets;print(secrets.token_urlsafe(12))"); warn "Generated admin password: $ADMIN_PW"; }

if [ -z "$DB_URL" ]; then
  warn "No DATABASE_URL — deploying with SQLite. Data will NOT persist."
  read -rp "Continue anyway? [y/N] " ok
  [ "$ok" = "y" ] || [ "$ok" = "Y" ] || die "Stopped."
fi

JWT_SECRET=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")

# ---------------------------------------------------------------- apis
say "Enabling APIs (first run takes a minute)…"
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com \
  --quiet

# ---------------------------------------------------------------- secrets
put_secret() {  # name, value
  local name=$1 value=$2
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --quiet >/dev/null
  fi
}

say "Storing secrets in Secret Manager…"
put_secret fsd-esg-jwt-secret "$JWT_SECRET"
SECRET_REFS="SECRET_KEY=fsd-esg-jwt-secret:latest"
[ -n "$DB_URL" ]     && { put_secret fsd-esg-database-url "$DB_URL";  SECRET_REFS="$SECRET_REFS,DATABASE_URL=fsd-esg-database-url:latest"; }
[ -n "$GEMINI_KEY" ] && { put_secret fsd-esg-gemini-key  "$GEMINI_KEY"; SECRET_REFS="$SECRET_REFS,GEMINI_API_KEY=fsd-esg-gemini-key:latest"; }

# The Cloud Run runtime identity must be allowed to read them. Skipping
# this is the usual reason a first deploy fails with a permission error
# the moment the container starts.
PROJECT_NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUM}-compute@developer.gserviceaccount.com"
say "Granting $RUNTIME_SA access to the secrets…"
for s in fsd-esg-jwt-secret fsd-esg-database-url fsd-esg-gemini-key; do
  gcloud secrets describe "$s" >/dev/null 2>&1 || continue
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
done

# ---------------------------------------------------------------- deploy
say "Building and deploying (first run takes 3-5 minutes)…"
gcloud run deploy "$SERVICE" \
  --source ./backend \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 3 \
  --set-secrets "$SECRET_REFS" \
  --set-env-vars "DEFAULT_ADMIN_PASSWORD=${ADMIN_PW},SEED_ON_BOOT=true,CORS_ORIGINS=*" \
  --quiet

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')

# Seeding is for the first boot only; leaving it on makes every cold
# start re-import the dataset.
say "Turning off boot-time seeding…"
gcloud run services update "$SERVICE" --region "$REGION" \
  --remove-env-vars SEED_ON_BOOT --quiet >/dev/null

# ---------------------------------------------------------------- verify
echo
say "Checking the deployment…"
sleep 5
if curl -fsS "${URL}/api/health" 2>/dev/null | tee /tmp/esg-health.json | python3 -m json.tool; then
  DB=$(python3 -c "import json;print(json.load(open('/tmp/esg-health.json'))['database'])")
  AI=$(python3 -c "import json;print(json.load(open('/tmp/esg-health.json'))['ai']['enabled'])")
  echo
  [ "$DB" = "sqlite" ] && warn "database is sqlite — data will not survive a redeploy."
  [ "$AI" = "False" ]  && warn "AI is off — the key did not reach the container; replies will be templates."
else
  warn "Health check did not answer yet. Cold start can take a moment; try again:"
  echo "  curl ${URL}/api/health"
fi

cat <<SUMMARY

${GRN}${BOLD}Deployed.${RST}

  API         ${BOLD}${URL}${RST}
  Docs        ${URL}/docs
  Login       Admin / ${ADMIN_PW}

${BOLD}Next: point the frontend at it${RST}

  cd frontend
  VITE_API_BASE_URL=${URL} npm run build
  # then deploy dist/ to Netlify, or edit dist/config.js

${BOLD}Then lock down CORS${RST} — it is currently open to any origin:

  gcloud run services update ${SERVICE} --region ${REGION} \\
    --set-env-vars CORS_ORIGINS=https://your-frontend-domain

${BOLD}Logs${RST}
  gcloud run services logs tail ${SERVICE} --region ${REGION}

SUMMARY
