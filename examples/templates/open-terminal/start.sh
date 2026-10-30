#!/bin/sh
set -eu
test -n "${OPEN_TERMINAL_API_KEY:-}" || { printf '%s\n' 'OPEN_TERMINAL_API_KEY is required' >&2; exit 1; }
umask 077
mkdir -p /workspace/.cache /workspace/.local/state
cd /workspace
exec open-terminal run --host 0.0.0.0 --port 8000
