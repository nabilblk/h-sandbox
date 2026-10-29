#!/bin/sh
set -eu
python -c 'from importlib.metadata import version; assert version("open-terminal") == "0.14.6"; import matplotlib'
test -x /usr/local/bin/harakiri-open-terminal
test -x /bin/bash
test "$(id -u)" != 0
export OPEN_TERMINAL_API_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
log="$(mktemp)"
/usr/local/bin/harakiri-open-terminal >"$log" 2>&1 &
service_pid=$!
cleanup() {
  kill "$service_pid" 2>/dev/null || true
  wait "$service_pid" 2>/dev/null || true
  rm -f "$log"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
attempt=0
while [ "$attempt" -lt 30 ]; do
  kill -0 "$service_pid" 2>/dev/null || { printf '%s\n' 'Open Terminal exited before readiness' >&2; exit 1; }
  if curl --fail --silent --output /dev/null --max-time 1 \
    -H "Authorization: Bearer $OPEN_TERMINAL_API_KEY" http://127.0.0.1:8000/health; then
    printf '%s\n' 'Non-root Open Terminal startup and HTTP health passed'
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done
printf '%s\n' 'Open Terminal readiness deadline exceeded' >&2
exit 1
