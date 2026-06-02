# syntax=docker/dockerfile:1.7

# Harakiri OpenCode template.
#
# Purpose-built coding-agent runtime:
#   OpenCode CLI/server + Node package managers + Python/Git/common tools

FROM node:22-bookworm-slim

ARG OPENCODE_VERSION=1.15.13
ARG PNPM_VERSION=11.5.1
ARG YARN_VERSION=1.22.22

ENV COREPACK_HOME=/root/.cache/corepack \
    HOME=/root \
    NPM_CONFIG_CACHE=/root/.npm \
    OPEN_HARAKIRI_WORKSPACE=/workspace \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    XDG_CACHE_HOME=/root/.cache \
    XDG_CONFIG_HOME=/root/.config \
    XDG_DATA_HOME=/root/.local/share \
    XDG_STATE_HOME=/root/.local/state \
    npm_config_cache=/root/.npm

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      curl \
      fd-find \
      findutils \
      git \
      gnupg \
      grep \
      gzip \
      jq \
      less \
      make \
      nano \
      openssh-client \
      openssl \
      pkg-config \
      procps \
      python3 \
      python3-pip \
      python3-venv \
      ripgrep \
      rsync \
      sed \
      tar \
      tini \
      unzip \
      vim-tiny \
      xz-utils \
      zip \
 && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
 && corepack prepare "yarn@${YARN_VERSION}" --activate \
 && npm install -g "opencode-ai@${OPENCODE_VERSION}" \
 && npm cache clean --force \
 && opencode --version \
 && pnpm --version \
 && yarn --version

RUN mkdir -p \
      /root/.cache \
      /root/.config \
      /root/.local/share \
      /root/.local/state \
      /root/.npm \
      /home/user \
      /workspace \
 && ln -sfn /workspace /home/user/workspace \
 && chmod -R g=u /root /home/user /workspace \
 && chmod 1777 /tmp

COPY smoke.sh /usr/local/bin/harakiri-opencode-smoke
RUN chmod +x /usr/local/bin/harakiri-opencode-smoke

WORKDIR /workspace
EXPOSE 4096 3000 5173

CMD ["sleep", "3600"]
