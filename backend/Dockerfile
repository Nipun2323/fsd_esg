FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Build deps for wheels that need compiling, removed again after.
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt \
    && apt-get purge -y gcc && apt-get autoremove -y

COPY . .

# Run as a non-root user. Cloud Run, Container Apps and App Runner all
# accept it, and it is one less thing to fix later.
RUN useradd --create-home --uid 10001 app && chown -R app:app /app
USER app

# Cloud Run and App Runner inject PORT; 8080 is their default.
ENV PORT=8080
EXPOSE 8080

# Seeding is OFF by default. On a platform that runs several instances,
# every one of them would otherwise import the dataset on boot, which
# is slow and pointless. Set SEED_ON_BOOT=true for the first deploy, or
# run `python -m scripts.import_companies` once as a job.
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
