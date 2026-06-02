# syntax=docker/dockerfile:1.7

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/root \
    OPEN_HARAKIRI_WORKSPACE=/workspace \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      findutils \
      git \
      grep \
      gzip \
      jq \
      less \
      nano \
      openssh-client \
      procps \
      python3 \
      ripgrep \
      sed \
      tar \
      tini \
      unzip \
      vim-tiny \
      xz-utils \
      zip \
 && mkdir -p /workspace \
 && chmod 1777 /tmp \
 && rm -rf /var/lib/apt/lists/*

COPY smoke.sh /usr/local/bin/harakiri-base-linux-smoke
RUN chmod +x /usr/local/bin/harakiri-base-linux-smoke

WORKDIR /workspace
CMD ["sleep", "3600"]
