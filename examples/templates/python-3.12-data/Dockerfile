# syntax=docker/dockerfile:1.7

FROM python:3.12-slim-bookworm

ENV HOME=/root \
    OPEN_HARAKIRI_WORKSPACE=/workspace \
    PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      curl \
      git \
      jq \
      libgomp1 \
      procps \
      ripgrep \
      tini \
 && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip uv \
 && python -m pip install \
      ipython \
      matplotlib \
      numpy \
      pandas \
      polars \
      pyarrow \
      scikit-learn \
      scipy

RUN mkdir -p /workspace \
 && chmod 1777 /tmp

COPY smoke.sh /usr/local/bin/harakiri-python-data-smoke
RUN chmod +x /usr/local/bin/harakiri-python-data-smoke

WORKDIR /workspace
CMD ["sleep", "3600"]
