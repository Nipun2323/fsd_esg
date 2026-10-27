FROM python:3.13-slim

WORKDIR /app

# Build deps for the wheels that need compiling, removed again after.
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y gcc && apt-get autoremove -y

COPY . .

EXPOSE 8000

# Imports the bundled dataset on first boot, then serves. The import is
# idempotent, so a restart updates rows rather than duplicating them.
CMD ["sh", "-c", "python -m scripts.import_companies || true; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
