# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

ARG PNPM_VERSION=10.11.0
ARG YARN_VERSION=1.22.22

ENV COREPACK_HOME=/root/.cache/corepack \
    HOME=/root \
    NPM_CONFIG_CACHE=/root/.npm \
    OPEN_HARAKIRI_WORKSPACE=/workspace \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    npm_config_cache=/root/.npm

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      curl \
      git \
      jq \
      openssh-client \
      procps \
      python3 \
      ripgrep \
      tini \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
 && corepack prepare "yarn@${YARN_VERSION}" --activate \
 && npm cache clean --force

RUN mkdir -p /workspace /root/.npm \
 && chmod -R g=u /root /workspace \
 && chmod 1777 /tmp

COPY smoke.sh /usr/local/bin/harakiri-node-app-smoke
RUN chmod +x /usr/local/bin/harakiri-node-app-smoke

WORKDIR /workspace
CMD ["sleep", "3600"]
