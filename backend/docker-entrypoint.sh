#!/bin/sh
set -e

if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  echo "SEED_ON_BOOT=true — importing the bundled dataset"
  python -m scripts.import_companies || echo "import failed; continuing to serve"
fi

# PORT is injected by Cloud Run and App Runner; the Dockerfile defaults it.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --proxy-headers --forwarded-allow-ips='*'
