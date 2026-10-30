# syntax=docker/dockerfile:1.7
FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/workspace \
    SHELL=/bin/bash \
    XDG_CACHE_HOME=/workspace/.cache \
    XDG_STATE_HOME=/workspace/.local/state \
    MPLCONFIGDIR=/workspace/.cache/matplotlib \
    OPEN_TERMINAL_ENABLE_TERMINAL=true \
    OPEN_TERMINAL_ENABLE_NOTEBOOKS=false \
    OPEN_TERMINAL_ENABLE_SYSTEM_PROMPT=false \
    OPEN_TERMINAL_MULTI_USER=false \
    OPEN_TERMINAL_FILE_BROWSER_ROOT=/workspace \
    OPEN_TERMINAL_MAX_SESSIONS=4 \
    OPEN_TERMINAL_EXECUTE_TIMEOUT=300 \
    OPEN_TERMINAL_CORS_ALLOWED_ORIGINS=http://adapter.invalid

RUN apt-get update \
 && apt-get install -y --no-install-recommends bash ca-certificates curl git procps \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 1000 --home-dir /workspace --shell /bin/bash sandbox \
 && mkdir -p /workspace \
 && chown sandbox:0 /workspace \
 && chmod 0770 /workspace

COPY requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt
COPY --chmod=755 start.sh /usr/local/bin/harakiri-open-terminal
COPY --chmod=755 smoke.sh /usr/local/bin/harakiri-open-terminal-smoke
USER 1000:0
WORKDIR /workspace
EXPOSE 8000
CMD ["/usr/local/bin/harakiri-open-terminal"]
