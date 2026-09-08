#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
NAMESPACE="${HARAKIRI_NAMESPACE:-harakiri}"
TEMPLATE="${HARAKIRI_CREDENTIAL_VAULT_TEMPLATE:-python-3.12}"
STAMP="$(date +%s)-$$"
TMP_DIR="$(mktemp -d /tmp/harakiri-credential-vault.XXXXXX)"
REQUEST_DIR="${TMP_DIR}/requests"
RESPONSE_DIR="${TMP_DIR}/responses"
mkdir -m 700 "${REQUEST_DIR}" "${RESPONSE_DIR}"

TEMP_KEY=0
SANDBOX_ID=""
SECRET_ID=""
REFERENCE_ID=""
KUBERNETES_SECRET="harakiri-vault-smoke-${STAMP}"

cleanup() {
  set +e
  if [[ -n "${SANDBOX_ID}" ]]; then
    curl -sS --config "${TMP_DIR}/api.curl" -X DELETE \
      "${API_URL}/v1/sandboxes/${SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${REFERENCE_ID}" ]]; then
    curl -sS --config "${TMP_DIR}/api.curl" -X DELETE \
      "${API_URL}/v1/external-secret-references/${REFERENCE_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SECRET_ID}" ]]; then
    curl -sS --config "${TMP_DIR}/api.curl" -X DELETE \
      "${API_URL}/v1/credential-secrets/${SECRET_ID}" >/dev/null 2>&1 || true
  fi
  kubectl -n "${NAMESPACE}" delete secret "${KUBERNETES_SECRET}" --ignore-not-found >/dev/null 2>&1 || true
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    printf 'header = "authorization: Bearer %s"\n' "${HARAKIRI_ACCESS_TOKEN}" >"${TMP_DIR}/bearer.curl"
    chmod 600 "${TMP_DIR}/bearer.curl"
    curl -sS --config "${TMP_DIR}/bearer.curl" -X DELETE \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

fail() {
  echo "credential vault smoke failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

api() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local output="$4"
  local args=(-sS --config "${TMP_DIR}/api.curl" -X "${method}")
  local status
  if [[ -n "${payload}" ]]; then
    args+=(-H "content-type: application/json")
    args+=(--data-binary "@${payload}")
  fi
  status="$(curl "${args[@]}" -o "${output}" -w '%{http_code}' "${API_URL}${path}")" || \
    fail "${method} ${path} failed before receiving an HTTP response"
  if [[ ! "${status}" =~ ^2[0-9][0-9]$ ]]; then
    local error
    error="$(jq -c '{error: (.error // "unknown_error"), message: (.message // "response message omitted")}' "${output}" 2>/dev/null || printf '%s' '{"message":"non-JSON response omitted"}')"
    fail "${method} ${path} returned HTTP ${status}: ${error}"
  fi
}

api_status() {
  local method="$1"
  local path="$2"
  local payload="$3"
  local output="$4"
  curl -sS --config "${TMP_DIR}/api.curl" -X "${method}" -H "content-type: application/json" \
    --data-binary "@${payload}" -o "${output}" -w '%{http_code}' "${API_URL}${path}"
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
  jq -e --arg "${name}" "${value}" "${expression}" "${file}" >/dev/null || fail "${message}: $(jq -c . "${file}")"
}

wait_for_sandbox_status() {
  local expected="$1"
  local output="${RESPONSE_DIR}/sandbox-status.json"
  for _ in $(seq 1 45); do
    api GET "/v1/sandboxes/${SANDBOX_ID}" "" "${output}"
    if [[ "$(jq -r '.sandbox.status' "${output}")" == "${expected}" ]]; then
      return
    fi
    sleep 1
  done
  fail "sandbox ${SANDBOX_ID} did not reach ${expected}"
}

write_random_secret() {
  openssl rand -hex 32 >"$1"
  chmod 600 "$1"
}

assert_no_secret_leaks() {
  local evidence="${TMP_DIR}/runtime-evidence"
  mkdir -m 700 "${evidence}"
  api GET "/v1/credential-secrets?includeDeleted=true" "" "${evidence}/secrets.json"
  api GET "/v1/external-secret-references?includeDeleted=true" "" "${evidence}/references.json"
  api GET "/v1/sandboxes/${SANDBOX_ID}" "" "${evidence}/sandbox.json"
  api GET "/v1/sandboxes/${SANDBOX_ID}/credentials" "" "${evidence}/attachments.json"
  api GET "/v1/sandboxes/${SANDBOX_ID}/logs" "" "${evidence}/sandbox-logs.json"
  api GET "/v1/audit-events?limit=200" "" "${evidence}/audit.json"
  kubectl -n "${NAMESPACE}" logs deployment/harakiri-api --since=20m >"${evidence}/api.log" 2>&1 || true
  kubectl -n "${NAMESPACE}" logs deployment/harakiri-scheduler --since=20m >"${evidence}/scheduler.log" 2>&1 || true
  kubectl get batchsandboxes -A -o yaml >"${evidence}/batchsandboxes.yaml" 2>/dev/null || true

  local secret_file
  for secret_file in "${TMP_DIR}/stored-v1" "${TMP_DIR}/stored-v2" "${TMP_DIR}/stored-v3" "${TMP_DIR}/external" "${TMP_DIR}/ephemeral"; do
    if grep -R -F -f "${secret_file}" "${RESPONSE_DIR}" "${evidence}" >/dev/null; then
      fail "a raw credential appeared in API, log, audit, or runtime metadata"
    fi
  done
}

require_command curl
require_command jq
require_command kubectl
require_command openssl
curl -fsS "${API_URL}/health" >/dev/null || fail "Harakiri API is not reachable at ${API_URL}"
kubectl cluster-info >/dev/null || fail "Kubernetes is not reachable through ${KUBECONFIG}"

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$(HARAKIRI_TEST_KEY_EXTRA_SCOPES="credentials:manage,audit:read" HARAKIRI_TEST_KEY_NAME="credential-vault-${STAMP}" "${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
printf 'header = "x-api-key: %s"\n' "${HARAKIRI_API_KEY}" >"${TMP_DIR}/api.curl"
chmod 600 "${TMP_DIR}/api.curl"

write_random_secret "${TMP_DIR}/stored-v1"
write_random_secret "${TMP_DIR}/stored-v2"
write_random_secret "${TMP_DIR}/stored-v3"
write_random_secret "${TMP_DIR}/external"
write_random_secret "${TMP_DIR}/ephemeral"

jq -n --rawfile value "${TMP_DIR}/stored-v1" --arg stamp "${STAMP}" '{
  name: ("vault-smoke-" + $stamp),
  providerPresetId: "custom",
  customProfile: {
    host: "httpbin.org", authType: "apiKey", headerName: "X-Harakiri-Vault-Smoke",
    methods: ["GET"], paths: ["/anything"], envName: "HARAKIRI_VAULT_SMOKE_KEY", testPath: "/anything"
  },
  value: ($value | rtrimstr("\n")), usePolicy: "admins_only",
  fakeEnv: { HARAKIRI_VAULT_SMOKE_KEY: "fake-harakiri-vault-smoke" }
}' >"${REQUEST_DIR}/create-secret.json"
api POST "/v1/credential-secrets" "${REQUEST_DIR}/create-secret.json" "${RESPONSE_DIR}/create-secret.json"
SECRET_ID="$(jq -r '.secret.id' "${RESPONSE_DIR}/create-secret.json")"
assert_json '.secret.status == "active" and .secret.hasEncryptedSecret == true and (.secret | has("value") | not)' \
  "${RESPONSE_DIR}/create-secret.json" "workspace secret response was not write-only"
echo "created encrypted source ${SECRET_ID}"

jq -n --rawfile value "${TMP_DIR}/stored-v2" '{value: ($value | rtrimstr("\n"))}' >"${REQUEST_DIR}/rotate-secret.json"
api POST "/v1/credential-secrets/${SECRET_ID}/rotate" "${REQUEST_DIR}/rotate-secret.json" "${RESPONSE_DIR}/rotate-secret.json"
assert_json '.secret.version == 2 and (.secret | has("value") | not)' "${RESPONSE_DIR}/rotate-secret.json" \
  "workspace secret rotation was not write-only"
echo "rotated encrypted source"

jq -n --arg secretId "${SECRET_ID}" '{
  sourceType:"harakiri_encrypted", secretId:$secretId,
  credentialName:"stored-smoke", bindingName:"stored-smoke"
}' >"${REQUEST_DIR}/attach-stored.json"

jq -n --arg template "${TEMPLATE}" --arg secretId "${SECRET_ID}" --arg stamp "${STAMP}" '{
  template: $template, name: ("vault-smoke-" + $stamp), ttlSeconds: 600, wait: true,
  credentials: [{
    sourceType: "harakiri_encrypted", secretId: $secretId,
    credentialName: "stored-smoke", bindingName: "stored-smoke"
  }]
}' >"${REQUEST_DIR}/create-sandbox.json"
api POST "/v1/sandboxes" "${REQUEST_DIR}/create-sandbox.json" "${RESPONSE_DIR}/create-sandbox.json"
SANDBOX_ID="$(jq -r '.sandbox.id' "${RESPONSE_DIR}/create-sandbox.json")"
STORED_ATTACHMENT_ID="$(jq -r '.credentialAttachments[0].id' "${RESPONSE_DIR}/create-sandbox.json")"
assert_json '.sandbox.status == "running" and .credentialAttachments[0].status == "injected"' \
  "${RESPONSE_DIR}/create-sandbox.json" "stored credential was not injected at sandbox creation"
echo "created credential-bearing sandbox ${SANDBOX_ID}"

api POST "/v1/sandboxes/${SANDBOX_ID}/credentials/inspect" "" "${RESPONSE_DIR}/inspect-stored.json"
assert_json '.attachments[0].providerState == "present" and (.vault.credentials | length) == 1 and (.vault.bindings | length) == 1' \
  "${RESPONSE_DIR}/inspect-stored.json" "provider inspection did not observe the stored credential"

jq -n '{target:"https://httpbin.org/anything"}' >"${REQUEST_DIR}/test-stored.json"
api POST "/v1/sandboxes/${SANDBOX_ID}/credentials/${STORED_ATTACHMENT_ID}/test" \
  "${REQUEST_DIR}/test-stored.json" "${RESPONSE_DIR}/test-stored.json"
assert_json '.status == "reachable" and .ok == true' "${RESPONSE_DIR}/test-stored.json" \
  "stored credential target was not reachable"

read -r -d '' VERIFY_COMMAND <<'COMMAND' || true
python - <<'PY'
import hashlib
import json
import os
import urllib.request

fake = os.environ.get("HARAKIRI_VAULT_SMOKE_KEY")
with urllib.request.urlopen("https://httpbin.org/anything", timeout=15) as response:
    observed = json.load(response).get("headers", {}).get("X-Harakiri-Vault-Smoke")
if not fake or not observed or observed == fake:
    raise SystemExit("credential injection was not observed")
print(hashlib.sha256(observed.encode()).hexdigest())
PY
COMMAND
jq -n --arg command "${VERIFY_COMMAND}" '{command:$command, timeoutMs:30000}' >"${REQUEST_DIR}/verify-injection.json"
api POST "/v1/sandboxes/${SANDBOX_ID}/run" "${REQUEST_DIR}/verify-injection.json" "${RESPONSE_DIR}/verify-injection.json"
STORED_V2_HASH="$(tr -d '\n' <"${TMP_DIR}/stored-v2" | openssl dgst -sha256 -r | awk '{print $1}')"
assert_json_arg hash "${STORED_V2_HASH}" '.result.exitCode == 0 and .result.stdout == ($hash + "\n")' \
  "${RESPONSE_DIR}/verify-injection.json" "sandbox did not observe the current runtime-only credential"
echo "verified fake env and runtime-only header injection"

jq -n --rawfile value "${TMP_DIR}/stored-v3" '{value: ($value | rtrimstr("\n"))}' >"${REQUEST_DIR}/rotate-live-secret.json"
api POST "/v1/credential-secrets/${SECRET_ID}/rotate" \
  "${REQUEST_DIR}/rotate-live-secret.json" "${RESPONSE_DIR}/rotate-live-secret.json"
assert_json '.secret.version == 3 and (.secret | has("value") | not)' \
  "${RESPONSE_DIR}/rotate-live-secret.json" "live workspace secret rotation was not write-only"
api GET "/v1/sandboxes/${SANDBOX_ID}/credentials" "" "${RESPONSE_DIR}/after-live-rotation.json"
assert_json_arg id "${STORED_ATTACHMENT_ID}" \
  '.attachments[] | select(.id == $id) | .status == "injected" and .sourceMetadata.version == 3' \
  "${RESPONSE_DIR}/after-live-rotation.json" "live source rotation did not converge the runtime attachment"
api POST "/v1/sandboxes/${SANDBOX_ID}/run" \
  "${REQUEST_DIR}/verify-injection.json" "${RESPONSE_DIR}/verify-rotated-injection.json"
STORED_V3_HASH="$(tr -d '\n' <"${TMP_DIR}/stored-v3" | openssl dgst -sha256 -r | awk '{print $1}')"
[[ "${STORED_V3_HASH}" != "${STORED_V2_HASH}" ]] || fail "rotation fixtures unexpectedly have the same digest"
assert_json_arg hash "${STORED_V3_HASH}" '.result.exitCode == 0 and .result.stdout == ($hash + "\n")' \
  "${RESPONSE_DIR}/verify-rotated-injection.json" "sandbox did not observe the rotated credential"
echo "verified live source rotation convergence"

jq -n '{target:"https://example.com/"}' >"${REQUEST_DIR}/test-mismatch.json"
api POST "/v1/sandboxes/${SANDBOX_ID}/credentials/${STORED_ATTACHMENT_ID}/test" \
  "${REQUEST_DIR}/test-mismatch.json" "${RESPONSE_DIR}/test-mismatch.json"
assert_json '.status == "binding_mismatch" and .ok == false' "${RESPONSE_DIR}/test-mismatch.json" \
  "out-of-scope credential target did not fail before runtime access"

api POST "/v1/sandboxes/${SANDBOX_ID}/egress/test" "${REQUEST_DIR}/test-mismatch.json" "${RESPONSE_DIR}/test-egress.json"
assert_json '.status == "blocked_or_unreachable" and .ok == false' "${RESPONSE_DIR}/test-egress.json" \
  "credential-aware egress allowed an unrelated destination"

HTTP_STATUS="$(api_status POST "/v1/sandboxes/${SANDBOX_ID}/credentials" "${REQUEST_DIR}/attach-stored.json" "${RESPONSE_DIR}/duplicate.json")"
[[ "${HTTP_STATUS}" == "400" ]] || fail "duplicate credential attach returned HTTP ${HTTP_STATUS}, expected 400"
assert_json '.error == "credential_vault_invalid_binding"' "${RESPONSE_DIR}/duplicate.json" \
  "duplicate credential attach returned the wrong error"

jq -n --rawfile value "${TMP_DIR}/ephemeral" '{
  sourceType:"inline_ephemeral", displayName:"Ambiguous smoke", credentialName:"ambiguous-smoke",
  value:($value | rtrimstr("\n")), binding:{name:"ambiguous-smoke", match:{schemes:["https"],hosts:["httpbin.org"],methods:["GET"],paths:["/anything"]},auth:{type:"apiKey",name:"X-Harakiri-Vault-Smoke-Other"}}
}' >"${REQUEST_DIR}/attach-ambiguous.json"
HTTP_STATUS="$(api_status POST "/v1/sandboxes/${SANDBOX_ID}/credentials" "${REQUEST_DIR}/attach-ambiguous.json" "${RESPONSE_DIR}/attach-ambiguous.json")"
if [[ "${HTTP_STATUS}" == "201" ]]; then
  AMBIGUOUS_ATTACHMENT_ID="$(jq -r '.attachment.id' "${RESPONSE_DIR}/attach-ambiguous.json")"
  api POST "/v1/sandboxes/${SANDBOX_ID}/credentials/${STORED_ATTACHMENT_ID}/test" \
    "${REQUEST_DIR}/test-stored.json" "${RESPONSE_DIR}/test-ambiguous.json"
  assert_json '.status != "reachable" and .ok == false' "${RESPONSE_DIR}/test-ambiguous.json" \
    "overlapping bindings did not fail closed"
  api DELETE "/v1/sandboxes/${SANDBOX_ID}/credentials/${AMBIGUOUS_ATTACHMENT_ID}" "" "${RESPONSE_DIR}/detach-ambiguous.json"
elif [[ "${HTTP_STATUS}" != "400" && "${HTTP_STATUS}" != "502" ]]; then
  fail "ambiguous binding returned unexpected HTTP ${HTTP_STATUS}"
fi
echo "verified duplicate and ambiguous bindings fail closed"

api POST "/v1/sandboxes/${SANDBOX_ID}/pause" "" "${RESPONSE_DIR}/pause.json"
wait_for_sandbox_status paused
api POST "/v1/sandboxes/${SANDBOX_ID}/resume" "" "${RESPONSE_DIR}/resume.json"
wait_for_sandbox_status running
api GET "/v1/sandboxes/${SANDBOX_ID}/credentials" "" "${RESPONSE_DIR}/after-resume.json"
assert_json_arg id "${STORED_ATTACHMENT_ID}" '.attachments[] | select(.id == $id) | .status == "injected"' \
  "${RESPONSE_DIR}/after-resume.json" "stored credential did not rehydrate after resume"
echo "verified stored-source rehydration"

api POST "/v1/credential-secrets/${SECRET_ID}/disable" "" "${RESPONSE_DIR}/disable-secret.json"
api GET "/v1/sandboxes/${SANDBOX_ID}/credentials" "" "${RESPONSE_DIR}/after-disable.json"
assert_json_arg id "${STORED_ATTACHMENT_ID}" '.attachments[] | select(.id == $id) | .status == "detached"' \
  "${RESPONSE_DIR}/after-disable.json" "disabling a source did not revoke its live attachment"
api POST "/v1/credential-secrets/${SECRET_ID}/enable" "" "${RESPONSE_DIR}/enable-secret.json"
echo "verified source disable revocation"

kubectl -n "${NAMESPACE}" create secret generic "${KUBERNETES_SECRET}" \
  --from-file="api-key=${TMP_DIR}/external" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
jq -n --arg name "${KUBERNETES_SECRET}" --arg stamp "${STAMP}" '{
  name:("external-vault-smoke-" + $stamp), providerPresetId:"custom",
  customProfile:{host:"httpbin.org",authType:"apiKey",headerName:"X-Harakiri-External-Smoke",methods:["GET"],paths:["/anything"],envName:"HARAKIRI_EXTERNAL_SMOKE",testPath:"/anything"},
  resolverType:"kubernetes_secret", reference:{namespace:"harakiri",name:$name,key:"api-key"},
  usePolicy:"admins_only", fakeEnv:{HARAKIRI_EXTERNAL_SMOKE:"fake-external-smoke"}
}' >"${REQUEST_DIR}/create-reference.json"
api POST "/v1/external-secret-references" "${REQUEST_DIR}/create-reference.json" "${RESPONSE_DIR}/create-reference.json"
REFERENCE_ID="$(jq -r '.reference.id' "${RESPONSE_DIR}/create-reference.json")"
api POST "/v1/external-secret-references/${REFERENCE_ID}/validate" "" "${RESPONSE_DIR}/validate-reference.json"
assert_json '.reference.validation.state == "valid"' "${RESPONSE_DIR}/validate-reference.json" \
  "Kubernetes Secret reference did not validate"
jq -n --arg referenceId "${REFERENCE_ID}" '{sourceType:"external_ref",referenceId:$referenceId,credentialName:"external-smoke",bindingName:"external-smoke"}' \
  >"${REQUEST_DIR}/attach-reference.json"
api POST "/v1/sandboxes/${SANDBOX_ID}/credentials" "${REQUEST_DIR}/attach-reference.json" "${RESPONSE_DIR}/attach-reference.json"
EXTERNAL_ATTACHMENT_ID="$(jq -r '.attachment.id' "${RESPONSE_DIR}/attach-reference.json")"
api POST "/v1/sandboxes/${SANDBOX_ID}/credentials/${EXTERNAL_ATTACHMENT_ID}/test" \
  "${REQUEST_DIR}/test-stored.json" "${RESPONSE_DIR}/test-reference.json"
assert_json '.status == "reachable" and .ok == true' "${RESPONSE_DIR}/test-reference.json" \
  "external-reference credential target was not reachable"
api DELETE "/v1/external-secret-references/${REFERENCE_ID}" "" "${RESPONSE_DIR}/delete-reference.json"
REFERENCE_ID=""
api GET "/v1/sandboxes/${SANDBOX_ID}/credentials" "" "${RESPONSE_DIR}/after-reference-delete.json"
assert_json_arg id "${EXTERNAL_ATTACHMENT_ID}" '.attachments[] | select(.id == $id) | .status == "detached"' \
  "${RESPONSE_DIR}/after-reference-delete.json" "deleting an external source did not revoke its attachment"
echo "verified Kubernetes external reference and deletion revocation"

jq -n --rawfile value "${TMP_DIR}/ephemeral" '{
  sourceType:"inline_ephemeral", displayName:"Ephemeral smoke", credentialName:"ephemeral-smoke",
  value:($value | rtrimstr("\n")), binding:{name:"ephemeral-smoke",match:{schemes:["https"],hosts:["httpbin.org"],methods:["GET"],paths:["/anything"]},auth:{type:"apiKey",name:"X-Harakiri-Ephemeral-Smoke"}}
}' >"${REQUEST_DIR}/attach-ephemeral.json"
api POST "/v1/sandboxes/${SANDBOX_ID}/credentials" "${REQUEST_DIR}/attach-ephemeral.json" "${RESPONSE_DIR}/attach-ephemeral.json"
EPHEMERAL_ATTACHMENT_ID="$(jq -r '.attachment.id' "${RESPONSE_DIR}/attach-ephemeral.json")"
api POST "/v1/sandboxes/${SANDBOX_ID}/pause" "" "${RESPONSE_DIR}/pause-ephemeral.json"
wait_for_sandbox_status paused
api POST "/v1/sandboxes/${SANDBOX_ID}/resume" "" "${RESPONSE_DIR}/resume-ephemeral.json"
wait_for_sandbox_status running
api GET "/v1/sandboxes/${SANDBOX_ID}/credentials" "" "${RESPONSE_DIR}/after-ephemeral-resume.json"
assert_json_arg id "${EPHEMERAL_ATTACHMENT_ID}" '.attachments[] | select(.id == $id) | .status == "requires_reinjection"' \
  "${RESPONSE_DIR}/after-ephemeral-resume.json" "ephemeral credential did not expose reinjection state after resume"
echo "verified ephemeral lifecycle state"

assert_no_secret_leaks
echo "verified API, logs, audit, and runtime metadata contain no raw credential values"

api DELETE "/v1/sandboxes/${SANDBOX_ID}" "" "${RESPONSE_DIR}/kill.json"
HTTP_STATUS="$(api_status POST "/v1/sandboxes/${SANDBOX_ID}/credentials" "${REQUEST_DIR}/attach-ephemeral.json" "${RESPONSE_DIR}/attach-terminated.json")"
[[ "${HTTP_STATUS}" == "409" ]] || fail "terminated sandbox credential attach returned HTTP ${HTTP_STATUS}, expected 409"
SANDBOX_ID=""

api DELETE "/v1/credential-secrets/${SECRET_ID}" "" "${RESPONSE_DIR}/delete-secret.json"
SECRET_ID=""
kubectl -n "${NAMESPACE}" delete secret "${KUBERNETES_SECRET}" --ignore-not-found >/dev/null

echo "credential vault smoke passed"
