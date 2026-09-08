#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
TEMPLATE="${HARAKIRI_CREDENTIAL_VAULT_TEMPLATE:-python-3.12}"
STAMP="$(date +%s)-$$"
TMP_DIR="$(mktemp -d /tmp/harakiri-credential-vault-cli.XXXXXX)"
CLI_HOME="${TMP_DIR}/home"
CLI=(node "${ROOT}/packages/cli/dist/index.js")

TEMP_KEY=0
SANDBOX_ID=""
SECRET_ID=""

cleanup() {
  set +e
  if [[ -n "${SANDBOX_ID}" ]]; then
    run_cli kill "${SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SECRET_ID}" ]]; then
    run_cli vault secrets delete "${SECRET_ID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE \
      -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  unset HARAKIRI_CLI_STORED HARAKIRI_CLI_ROTATED HARAKIRI_CLI_EPHEMERAL
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

fail() {
  echo "credential vault CLI smoke failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

run_cli() {
  HOME="${CLI_HOME}" "${CLI[@]}" "$@"
}

assert_json() {
  local expression="$1"
  local file="$2"
  local message="$3"
  jq -e "${expression}" "${file}" >/dev/null || fail "${message}: $(jq -c . "${file}")"
}

assert_json_arg() {
  local name="$1"
  local value="$2"
  local expression="$3"
  local file="$4"
  local message="$5"
  jq -e --arg "${name}" "${value}" "${expression}" "${file}" >/dev/null || \
    fail "${message}: $(jq -c . "${file}")"
}

assert_no_value_leaks() {
  local value_file
  for value_file in "${TMP_DIR}/stored" "${TMP_DIR}/rotated" "${TMP_DIR}/ephemeral"; do
    if grep -R -F -f "${value_file}" "${TMP_DIR}/output" >/dev/null; then
      fail "a raw credential appeared in CLI output"
    fi
  done
}

require_command curl
require_command jq
require_command node
require_command openssl
[[ -x "${ROOT}/packages/cli/dist/index.js" ]] || fail "CLI is not built; run pnpm --filter @h-sandbox/cli build"
curl -fsS "${API_URL}/health" >/dev/null || fail "Harakiri API is not reachable at ${API_URL}"
mkdir -m 700 "${CLI_HOME}" "${TMP_DIR}/output"

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$(HARAKIRI_TEST_KEY_EXTRA_SCOPES="credentials:manage,audit:read" HARAKIRI_TEST_KEY_NAME="credential-vault-cli-${STAMP}" "${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

run_cli login --api-url "${API_URL}" --api-key "${HARAKIRI_API_KEY}" >"${TMP_DIR}/output/login.txt"

openssl rand -hex 32 >"${TMP_DIR}/stored"
openssl rand -hex 32 >"${TMP_DIR}/rotated"
openssl rand -hex 32 >"${TMP_DIR}/ephemeral"
export HARAKIRI_CLI_STORED="$(<"${TMP_DIR}/stored")"
export HARAKIRI_CLI_ROTATED="$(<"${TMP_DIR}/rotated")"
export HARAKIRI_CLI_EPHEMERAL="$(<"${TMP_DIR}/ephemeral")"

run_cli vault secrets create \
  --name "cli-vault-smoke-${STAMP}" \
  --host httpbin.org \
  --auth api-key \
  --header X-Harakiri-Cli-Smoke \
  --method GET \
  --path /anything \
  --env-name HARAKIRI_CLI_SECRET \
  --test-path /anything \
  --fake-env HARAKIRI_CLI_SECRET=fake-cli-vault \
  --from-env HARAKIRI_CLI_STORED \
  --json >"${TMP_DIR}/output/create-secret.json"
SECRET_ID="$(jq -r '.secret.id' "${TMP_DIR}/output/create-secret.json")"
[[ "${SECRET_ID}" == vlt_* ]] || fail "CLI did not return a workspace secret id"
assert_json '.secret.status == "active" and .secret.version == 1 and (.secret | has("value") | not)' \
  "${TMP_DIR}/output/create-secret.json" "workspace secret output was not sanitized"

run_cli create \
  --template "${TEMPLATE}" \
  --name "cli-vault-smoke-${STAMP}" \
  --ttl 600 \
  --credential "secret-id=${SECRET_ID}" >"${TMP_DIR}/output/create-sandbox.txt"
SANDBOX_ID="$(grep -E '^sbx_' "${TMP_DIR}/output/create-sandbox.txt" | tail -1)"
[[ "${SANDBOX_ID}" == sbx_* ]] || fail "CLI did not return a sandbox id"

run_cli vault inspect "${SANDBOX_ID}" --json >"${TMP_DIR}/output/inspect-stored.json"
assert_json '.attachments | length == 1' "${TMP_DIR}/output/inspect-stored.json" \
  "workspace secret attachment was not listed"
assert_json '.attachments[0].status == "injected" and .attachments[0].providerState == "present"' \
  "${TMP_DIR}/output/inspect-stored.json" "workspace secret was not present in the runtime vault"

run_cli run "${SANDBOX_ID}" \
  --cmd 'test "$HARAKIRI_CLI_SECRET" = "fake-cli-vault" && printf "fake-env-ok\n"' \
  >"${TMP_DIR}/output/fake-env.txt"
grep -qx 'fake-env-ok' "${TMP_DIR}/output/fake-env.txt" || \
  fail "sandbox did not receive the configured fake environment value"

run_cli vault secrets rotate "${SECRET_ID}" \
  --from-env HARAKIRI_CLI_ROTATED \
  --json >"${TMP_DIR}/output/rotate-secret.json"
assert_json '.secret.version == 2 and (.secret | has("value") | not)' \
  "${TMP_DIR}/output/rotate-secret.json" "workspace secret rotation output was not sanitized"
run_cli vault inspect "${SANDBOX_ID}" --json >"${TMP_DIR}/output/inspect-rotated.json"
assert_json '.attachments[0].status == "injected" and .attachments[0].providerState == "present" and .attachments[0].sourceMetadata.version == 2' \
  "${TMP_DIR}/output/inspect-rotated.json" "live source rotation did not converge through the CLI workflow"

run_cli vault attach "${SANDBOX_ID}" \
  --host example.com \
  --name cli-ephemeral \
  --auth api-key \
  --header X-Harakiri-Cli-Ephemeral \
  --method GET \
  --path / \
  --fake-env HARAKIRI_CLI_EPHEMERAL=fake-cli-ephemeral \
  --from-env HARAKIRI_CLI_EPHEMERAL \
  --json >"${TMP_DIR}/output/attach-ephemeral.json"
EPHEMERAL_ATTACHMENT_ID="$(jq -r '.attachment.id' "${TMP_DIR}/output/attach-ephemeral.json")"
[[ "${EPHEMERAL_ATTACHMENT_ID}" == sca_* ]] || fail "CLI did not return an ephemeral attachment id"
assert_json '.attachment.status == "injected" and (.attachment | has("value") | not)' \
  "${TMP_DIR}/output/attach-ephemeral.json" "ephemeral attachment output was not sanitized"
run_cli vault inspect "${SANDBOX_ID}" --json >"${TMP_DIR}/output/inspect-both.json"
assert_json '(.attachments | length) == 2 and all(.attachments[]; .providerState == "present")' \
  "${TMP_DIR}/output/inspect-both.json" "CLI did not observe both runtime vault attachments"

run_cli vault detach "${SANDBOX_ID}" "${EPHEMERAL_ATTACHMENT_ID}" --json \
  >"${TMP_DIR}/output/detach-ephemeral.json"
assert_json '.attachment.status == "detached" and .attachment.providerState == "missing"' \
  "${TMP_DIR}/output/detach-ephemeral.json" "ephemeral attachment was not detached from the runtime vault"
run_cli vault secrets disable "${SECRET_ID}" --json >"${TMP_DIR}/output/disable-secret.json"
assert_json '.secret.status == "disabled"' "${TMP_DIR}/output/disable-secret.json" \
  "workspace secret was not disabled"
run_cli vault list "${SANDBOX_ID}" --json >"${TMP_DIR}/output/list-revoked.json"
assert_json 'any(.attachments[]; .status == "detached") and all(.attachments[]; .status == "detached")' \
  "${TMP_DIR}/output/list-revoked.json" "source disable did not detach every active attachment"

run_cli vault audit --action-prefix credential_secret. --limit 100 --json \
  >"${TMP_DIR}/output/source-audit.json"
assert_json_arg secretId "${SECRET_ID}" \
  'any(.events[]; .targetId == $secretId and .action == "credential_secret.rotate") and any(.events[]; .targetId == $secretId and .action == "credential_secret.disable")' \
  "${TMP_DIR}/output/source-audit.json" "credential source audit evidence was incomplete"
run_cli vault audit --action-prefix sandbox.credential. --limit 100 --json \
  >"${TMP_DIR}/output/attachment-audit.json"
assert_json_arg sandboxId "${SANDBOX_ID}" \
  'any(.events[]; .targetId == $sandboxId and .action == "sandbox.credential.attached") and any(.events[]; .targetId == $sandboxId and .action == "sandbox.credential.detached")' \
  "${TMP_DIR}/output/attachment-audit.json" "credential attachment audit evidence was incomplete"
assert_no_value_leaks

echo "credential vault CLI smoke passed for sandbox ${SANDBOX_ID}"
