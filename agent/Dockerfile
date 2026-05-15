# Repflow Agent — containerised RBA runtime.
#
# Build context is the repo root (so we can COPY agent/ wholesale).
#   docker build -t ghcr.io/koinod/repflow-agent:latest -f agent/Dockerfile .
#
# Run:
#   docker run -d --name repflow-agent \
#     -e RBA_TOKEN=<one-shot-install-token> \
#     -e API_BASE=https://repflow.koino.capital \
#     -v "$HOME/.repflow/agent:/root/.repflow/agent" \
#     ghcr.io/koinod/repflow-agent:latest
#
# The container runs ENTRYPOINT which (a) redeems the install token if
# config.yaml is missing, then (b) execs runtime/agent.py for the lifetime
# of the container.
#
# Ollama runs OUTSIDE the container — the agent talks to host Ollama via
# OLLAMA_URL (default http://host.docker.internal:11434 on Mac/Win, or
# pass --add-host on Linux).

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    RBA_HOME=/root/.repflow/agent

# Playwright system deps + curl for the entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 \
    libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 \
    libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
    libxrandr2 wget xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN pip install 'requests>=2.31' 'scrapling[fetchers]>=0.4.7' playwright \
  && python -m playwright install chromium

# Copy agent runtime + scrapers + quote_agent
COPY agent/ /app/agent/

# Entrypoint: redeem token if needed, then run agent
COPY agent/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PYTHONPATH=/app/agent

ENTRYPOINT ["/entrypoint.sh"]
