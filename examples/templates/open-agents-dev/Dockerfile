# syntax=docker/dockerfile:1.7

# OpenSandbox image for Harakiri Open Agents runtimes.
#
# Browser-capable agent runtime surface:
#   bun + jq + agent-browser + Chromium + code-server + writable workspace

FROM node:22-bookworm-slim

ARG BUN_VERSION=1.2.14
ARG AGENT_BROWSER_VERSION=latest
ARG CODE_SERVER_VERSION=
ARG PNPM_VERSION=latest

ENV BUN_INSTALL=/usr/local \
    CHROME_BIN=/usr/bin/chromium \
    COREPACK_HOME=/home/sandbox/.cache/corepack \
    HOME=/home/sandbox \
    NPM_CONFIG_CACHE=/home/sandbox/.npm \
    OPEN_HARAKIRI_WORKSPACE=/workspace \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    XDG_CACHE_HOME=/home/sandbox/.cache \
    XDG_CONFIG_HOME=/home/sandbox/.config \
    XDG_DATA_HOME=/home/sandbox/.local/share \
    npm_config_cache=/home/sandbox/.npm

USER root

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      chromium \
      curl \
      fd-find \
      findutils \
      fonts-liberation \
      fonts-noto-color-emoji \
      git \
      gnupg \
      grep \
      gzip \
      jq \
      less \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libnss3 \
      nano \
      openssh-client \
      pkg-config \
      procps \
      python3 \
      python3-pip \
      python3-venv \
      ripgrep \
      sed \
      tar \
      tini \
      unzip \
      vim-tiny \
      xdg-utils \
      xz-utils \
      zip \
 && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install \
  | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
 && chmod +x /usr/local/bin/bun /usr/local/bin/bunx

RUN npm install -g \
      "agent-browser@${AGENT_BROWSER_VERSION}" \
      "pnpm@${PNPM_VERSION}" \
 && npm cache clean --force

RUN if [[ -n "${CODE_SERVER_VERSION}" ]]; then \
      curl -fsSL https://code-server.dev/install.sh \
        | sh -s -- --version "${CODE_SERVER_VERSION}"; \
    else \
      curl -fsSL https://code-server.dev/install.sh | sh; \
    fi

RUN groupadd --gid 1001 sandbox \
 && useradd \
      --uid 1001 \
      --gid 1001 \
      --home-dir /home/sandbox \
      --create-home \
      --shell /bin/bash \
      sandbox \
 && mkdir -p \
      /home/sandbox/.cache/corepack \
      /home/sandbox/.config \
      /home/sandbox/.local/share \
      /home/sandbox/.npm \
      /home/user \
      /workspace \
 && ln -sfn /workspace /home/user/workspace \
 && chown -R 1001:0 /home/sandbox /home/user /workspace \
 && chmod -R g=u /home/sandbox /home/user /workspace \
 && chmod 1777 /tmp

COPY smoke.sh /usr/local/bin/harakiri-open-agents-smoke
RUN chmod +x /usr/local/bin/harakiri-open-agents-smoke

# OpenSandbox currently presents /workspace as root-owned in the k0s runtime.
# Running this pilot image as root keeps the writable workspace contract intact
# until Harakiri/OpenSandbox can pass workdir volume ownership.
USER root
WORKDIR /workspace

CMD ["sleep", "3600"]
