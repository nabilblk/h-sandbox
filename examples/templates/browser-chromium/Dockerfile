# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

ENV CHROME_BIN=/usr/bin/chromium \
    COREPACK_HOME=/root/.cache/corepack \
    HOME=/root \
    NPM_CONFIG_CACHE=/root/.npm \
    OPEN_HARAKIRI_WORKSPACE=/workspace \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    npm_config_cache=/root/.npm

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      chromium \
      curl \
      fonts-liberation \
      fonts-noto-color-emoji \
      git \
      jq \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libnss3 \
      procps \
      python3 \
      ripgrep \
      tini \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare pnpm@latest --activate \
 && npm cache clean --force

RUN mkdir -p /workspace \
 && chmod 1777 /tmp

COPY smoke.sh /usr/local/bin/harakiri-browser-chromium-smoke
RUN chmod +x /usr/local/bin/harakiri-browser-chromium-smoke

WORKDIR /workspace
CMD ["sleep", "3600"]
