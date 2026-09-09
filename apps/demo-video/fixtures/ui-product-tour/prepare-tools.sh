#!/bin/sh
set -eu
printf 'Installing connectivity tools. Full package log: /tmp/tour-packages.log\n'
apt-get update -qq > /tmp/tour-packages.log 2>&1
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates >> /tmp/tour-packages.log 2>&1
curl --version | head -n 1
printf 'Connectivity tools ready.\n'
