#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
NAME="${HARAKIRI_REGISTRY_CREDENTIAL_SMOKE_NAME:-registry-cred-smoke-$(date +%s)}"
SECRET_VALUE="smoke-registry-token-${NAME}"
TEMP_KEY=0

cleanup() {
  set +e
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  local pgpod
  pgpod="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  if [[ -n "${pgpod}" ]]; then
    kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
      psql -U harakiri -d harakiri -qAtc "delete from template_registry_credentials where name = '${NAME}';" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

CREATE_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"name\":\"${NAME}\",\"registryHost\":\"https://registry.example.com/\",\"username\":\"robot$\",\"secret\":\"${SECRET_VALUE}\",\"purpose\":\"push_pull\",\"repositoryPrefix\":\"harakiri/templates/org-smoke\",\"pullSecretRef\":\"${NAME}-pull\",\"pushSecretRef\":\"${NAME}-push\",\"metadata\":{\"password\":\"${SECRET_VALUE}\",\"smoke\":true}}" \
  "${API_URL}/v1/registry-credentials")"
printf '%s\n' "${CREATE_RESPONSE}"

if grep -q "${SECRET_VALUE}" <<<"${CREATE_RESPONSE}"; then
  echo "registry credential smoke failed: create response leaked secret material" >&2
  exit 1
fi

CREDENTIAL_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.credential.id)" "${CREATE_RESPONSE}")"
HAS_SECRET="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.credential.hasEncryptedSecret ? '1' : '0')" "${CREATE_RESPONSE}")"
REGISTRY_HOST="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.credential.registryHost)" "${CREATE_RESPONSE}")"
REDACTED_PASSWORD="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.credential.metadata.password)" "${CREATE_RESPONSE}")"
if [[ -z "${CREDENTIAL_ID}" || "${HAS_SECRET}" != "1" || "${REGISTRY_HOST}" != "registry.example.com" || "${REDACTED_PASSWORD}" != "[redacted]" ]]; then
  echo "registry credential smoke failed: unexpected create response" >&2
  exit 1
fi

LIST_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/registry-credentials")"
LIST_COUNT="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.credentials.filter(c => c.id === process.argv[2]).length)" "${LIST_RESPONSE}" "${CREDENTIAL_ID}")"
if [[ "${LIST_COUNT}" != "1" ]]; then
  echo "registry credential smoke failed: list did not include ${CREDENTIAL_ID}" >&2
  exit 1
fi

PGPOD="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"
STORED_SECRET_STATE="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select (secret_ciphertext is not null)::text || '|' || (secret_ciphertext = '${SECRET_VALUE}')::text || '|' || coalesce(purpose, '') || '|' || coalesce(repository_prefix, '') from template_registry_credentials where id = '${CREDENTIAL_ID}';")"
IFS='|' read -r SECRET_PRESENT SECRET_MATCHES PURPOSE REPOSITORY_PREFIX <<<"${STORED_SECRET_STATE}"
if [[ "${SECRET_PRESENT}" != "true" || "${SECRET_MATCHES}" != "false" || "${PURPOSE}" != "push_pull" || "${REPOSITORY_PREFIX}" != "harakiri/templates/org-smoke" ]]; then
  echo "registry credential smoke failed: stored secret state was ${STORED_SECRET_STATE}" >&2
  exit 1
fi

DELETE_RESPONSE="$(curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/registry-credentials/${CREDENTIAL_ID}")"
REVOKED_AT="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.credential.revokedAt || '')" "${DELETE_RESPONSE}")"
if [[ -z "${REVOKED_AT}" ]]; then
  echo "registry credential smoke failed: delete did not revoke credential" >&2
  exit 1
fi

ACTIVE_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/registry-credentials")"
ACTIVE_COUNT="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.credentials.filter(c => c.id === process.argv[2]).length)" "${ACTIVE_RESPONSE}" "${CREDENTIAL_ID}")"
if [[ "${ACTIVE_COUNT}" != "0" ]]; then
  echo "registry credential smoke failed: revoked credential remained active" >&2
  exit 1
fi

AUDIT_ACTIONS="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select action from audit_events where target_id = '${CREDENTIAL_ID}' order by created_at;")"
for action in template.registry_credential.upsert template.registry_credential.revoke; do
  if ! grep -qx "${action}" <<<"${AUDIT_ACTIONS}"; then
    echo "registry credential smoke failed: missing audit action ${action}" >&2
    exit 1
  fi
done

echo "template registry credential smoke passed: ${CREDENTIAL_ID}"
