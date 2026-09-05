#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
STATE_DIR="${HARAKIRI_PORT_FORWARD_STATE_DIR:-/tmp/harakiri-portforwards}"
SESSION_NAME="${HARAKIRI_PORT_FORWARD_SESSION:-harakiri-port-forwards}"

mkdir -p "${STATE_DIR}"

forwards=(
  "api 18082 harakiri svc/harakiri-api 8080 http://127.0.0.1:18082/health"
  "web 15173 harakiri svc/harakiri-web 80 http://127.0.0.1:15173/"
  "keycloak 18084 keycloak svc/keycloak 8080 http://127.0.0.1:18084/realms/harakiri/.well-known/openid-configuration"
  "mailpit 18086 keycloak svc/mailpit 8025 http://127.0.0.1:18086/"
  "opensandbox 18083 opensandbox-system svc/opensandbox-server 80 http://127.0.0.1:18083/health"
  "gateway 18085 opensandbox-system svc/opensandbox-ingress-gateway 80 http://127.0.0.1:18085/status.ok"
  "ingress-https 18087 ingress-nginx svc/ingress-nginx-controller 443 tcp://127.0.0.1:18087"
)

is_kubectl_forward_pid() {
  local pid="$1"
  ps -p "${pid}" -o command= 2>/dev/null | grep -q "kubectl .*port-forward"
}

stop_one() {
  local name="$1"
  local port="$2"
  local pid_file="${STATE_DIR}/${port}.pid"

  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
    rm -f "${pid_file}"
  fi

  while read -r pid; do
    if [[ -n "${pid}" ]] && is_kubectl_forward_pid "${pid}"; then
      kill "${pid}" 2>/dev/null || true
    fi
  done < <(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)

  rm -f "${STATE_DIR}/${port}.log"
  echo "stopped ${name} on ${port}"
}

quote() {
  printf "%q" "$1"
}

start_tmux() {
  for item in "${forwards[@]}"; do
    # shellcheck disable=SC2086
    set -- ${item}
    local name="$1"
    local port="$2"
    local namespace="$3"
    local service="$4"
    local target="$5"
    local url="$6"
    local log="${STATE_DIR}/${port}.log"
    if tmux list-windows -t "${SESSION_NAME}" -F '#{window_name}' 2>/dev/null | grep -Fxq "${name}"; then
      echo "already running ${name}: ${url}"
      continue
    fi
    : >"${log}"

    local shell_cmd
    # Service forwards end when their selected pod is replaced. Keep the origin alive across rollouts.
    shell_cmd="export KUBECONFIG=$(quote "${KUBECONFIG}"); while true; do kubectl -n $(quote "${namespace}") port-forward $(quote "${service}") $(quote "${port}:${target}") 2>&1 | tee -a $(quote "${log}"); sleep 2; done"

    if ! tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
      tmux new-session -d -s "${SESSION_NAME}" -n "${name}" "bash -lc $(quote "${shell_cmd}")"
    else
      tmux new-window -t "${SESSION_NAME}" -n "${name}" "bash -lc $(quote "${shell_cmd}")"
    fi
    echo "started ${name}: ${url}"
  done
}

start_one() {
  local name="$1"
  local port="$2"
  local namespace="$3"
  local service="$4"
  local target="$5"
  local url="$6"

  local existing
  existing="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${existing}" ]]; then
    echo "${name} already has a listener on ${port}; leaving it alone"
    return
  fi

  nohup kubectl -n "${namespace}" port-forward "${service}" "${port}:${target}" >"${STATE_DIR}/${port}.log" 2>&1 &
  echo "$!" >"${STATE_DIR}/${port}.pid"
  echo "started ${name}: ${url}"
}

check_one() {
  local port="$1"
  local url="$2"

  if [[ "${url}" == tcp://* ]]; then
    lsof -tiTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  curl -fsS "${url}" >/dev/null 2>&1
}

wait_one() {
  local name="$1"
  local port="$2"
  local url="$6"

  for _ in $(seq 1 30); do
    if check_one "${port}" "${url}"; then
      echo "ready ${name}: ${url}"
      return
    fi
    sleep 1
  done

  echo "not ready ${name}; see ${STATE_DIR}/${port}.log" >&2
  return 1
}

status_one() {
  local name="$1"
  local port="$2"
  local url="$6"

  if lsof -tiTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    if check_one "${port}" "${url}"; then
      echo "up   ${name} ${url}"
    else
      echo "open ${name} ${url} (health check failed)"
    fi
  else
    echo "down ${name} ${url}"
  fi
}

command="${1:-start}"

case "${command}" in
  start)
    if command -v tmux >/dev/null 2>&1; then
      start_tmux
    else
      for item in "${forwards[@]}"; do
        # shellcheck disable=SC2086
        start_one ${item}
      done
    fi
    for item in "${forwards[@]}"; do
      # shellcheck disable=SC2086
      wait_one ${item}
    done
    ;;
  stop)
    if command -v tmux >/dev/null 2>&1 && tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
      tmux kill-session -t "${SESSION_NAME}"
      echo "stopped tmux session ${SESSION_NAME}"
    fi
    for item in "${forwards[@]}"; do
      # shellcheck disable=SC2086
      stop_one ${item}
    done
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    for item in "${forwards[@]}"; do
      # shellcheck disable=SC2086
      status_one ${item}
    done
    ;;
  attach)
    if ! command -v tmux >/dev/null 2>&1; then
      echo "tmux is not installed" >&2
      exit 1
    fi
    tmux attach -t "${SESSION_NAME}"
    ;;
  *)
    echo "usage: $0 [start|stop|restart|status|attach]" >&2
    exit 2
    ;;
esac
