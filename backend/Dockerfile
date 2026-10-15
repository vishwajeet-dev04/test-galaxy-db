# Galaxy API. Build context is the repo root (needs scripts/, config/, files/):
#   docker build -f backend/Dockerfile .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt "gunicorn>=22.0"

COPY backend/app backend/app
COPY scripts scripts
COPY files files
# Shipped defaults; the entrypoint seeds the /app/config volume from here.
COPY config config.defaults
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh

# sed: a Windows checkout can turn the script to CRLF, and "#!/bin/sh\r" fails with "no such file".
RUN useradd --system --uid 10001 --home /app galaxy \
    && mkdir -p config backend/data var \
    && sed -i 's/\r$//' /usr/local/bin/backend-entrypoint.sh \
    && chmod 0755 /usr/local/bin/backend-entrypoint.sh \
    && chown -R galaxy:galaxy /app

USER galaxy
WORKDIR /app/backend
EXPOSE 8000

# /api/health is rate-limited to 60/min per IP; one probe every 30 s stays well under it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
# One worker: the login rate limiter and the Vtiger sync thread live in-process,
# and SQLite / roster JSON are written in place. 600 s so a long sync is not killed.
CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "-w", "1", "-b", "0.0.0.0:8000", "--timeout", "600", "--access-logfile", "-"]
