#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
STAMP="$(date +%s)"
OWNED_TEMPLATE="visibility-owned-${STAMP}"
FOREIGN_TEMPLATE="visibility-foreign-${STAMP}"
PLATFORM_PRIVATE_TEMPLATE="visibility-platform-private-${STAMP}"
FOREIGN_SLUG="visibility-foreign-${STAMP}"
HARAKIRI_API_KEY_ID="${HARAKIRI_API_KEY_ID:-}"
BUILD_ID=""
PGPOD=""

cleanup() {
  set +e
  if [[ -n "${BUILD_ID}" && -n "${HARAKIRI_API_KEY:-}" ]]; then
    curl -fsS -X POST -H "x-api-key: ${HARAKIRI_API_KEY}" \
      "${API_URL}/v1/template-builds/${BUILD_ID}/cancel" >/dev/null 2>&1 || true
  fi
  if [[ -n "${HARAKIRI_API_KEY_ID}" && -n "${HARAKIRI_API_KEY:-}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PGPOD}" ]]; then
    kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
      psql -U harakiri -d harakiri -qAtc "delete from templates where id in ('${OWNED_TEMPLATE}', '${FOREIGN_TEMPLATE}', '${PLATFORM_PRIVATE_TEMPLATE}'); delete from organizations where slug = '${FOREIGN_SLUG}';" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
fi

PGPOD="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"

kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -v ON_ERROR_STOP=1 -qAtc "
    insert into organizations (name, slug, default_template_id, idle_ttl_seconds, max_concurrency)
    values ('Visibility Foreign', '${FOREIGN_SLUG}', 'python-3.12-data', 300, 200)
    on conflict (slug) do update set name = excluded.name;
    insert into templates
      (id, organization_id, name, description, image, icon, tags, aliases, boot_ms,
       visibility, default_entrypoint, cpu_count, memory_mb, workdir, default_ports,
       runtime_family, status, source_kind)
    select '${FOREIGN_TEMPLATE}', id, 'Foreign private', 'Must not cross orgs.',
           'ubuntu:24.04', 'file', array['visibility'], array['${FOREIGN_TEMPLATE}'],
           220, 'private', array['sleep','3600'], 1, 1024, '/', array[]::integer[],
           'custom', 'ready', 'custom'
    from organizations where slug = '${FOREIGN_SLUG}'
    on conflict (id) do update set updated_at = now();
    insert into templates
      (id, organization_id, name, description, image, icon, tags, aliases, boot_ms,
       visibility, default_entrypoint, cpu_count, memory_mb, workdir, default_ports,
       runtime_family, status, source_kind)
    values ('${PLATFORM_PRIVATE_TEMPLATE}', null, 'Platform private', 'Must stay hidden.',
            'ubuntu:24.04', 'file', array['visibility'], array['${PLATFORM_PRIVATE_TEMPLATE}'],
            220, 'private', array['sleep','3600'], 1, 1024, '/', array[]::integer[],
            'custom', 'ready', 'seed')
    on conflict (id) do update set updated_at = now();
  " >/dev/null

assert_template_count() {
  local query="$1"
  local expected="$2"
  local response
  response="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/templates?q=${query}")"
  local count
  count="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.templates.length)" "${response}")"
  if [[ "${count}" != "${expected}" ]]; then
    echo "expected ${expected} templates for query ${query}, got ${count}" >&2
    exit 1
  fi
}

assert_not_found() {
  local template_id="$1"
  local status
  status="$(curl -sS -o /tmp/harakiri-visibility-response.json -w '%{http_code}' -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/templates/${template_id}")"
  if [[ "${status}" != "404" ]]; then
    echo "expected ${template_id} to be hidden with 404, got ${status}: $(cat /tmp/harakiri-visibility-response.json)" >&2
    exit 1
  fi
}

assert_template_count "${FOREIGN_TEMPLATE}" "0"
assert_template_count "${PLATFORM_PRIVATE_TEMPLATE}" "0"
assert_not_found "${FOREIGN_TEMPLATE}"
assert_not_found "${PLATFORM_PRIVATE_TEMPLATE}"

MUTATE_STATUS="$(curl -sS -o /tmp/harakiri-visibility-mutate.json -w '%{http_code}' \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H 'content-type: application/json' \
  -d '{"sourceType":"image","imageDestination":"ubuntu:24.04"}' \
  "${API_URL}/v1/templates/python-3.12/builds")"
if [[ "${MUTATE_STATUS}" != "403" ]]; then
  echo "expected shared platform template mutation to return 403, got ${MUTATE_STATUS}: $(cat /tmp/harakiri-visibility-mutate.json)" >&2
  exit 1
fi
MUTATE_ERROR="$(node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/harakiri-visibility-mutate.json','utf8')); console.log(r.error)")"
if [[ "${MUTATE_ERROR}" != "template_not_mutable" ]]; then
  echo "expected template_not_mutable, got ${MUTATE_ERROR}" >&2
  exit 1
fi

CREATE_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H 'content-type: application/json' \
  -d "{\"id\":\"${OWNED_TEMPLATE}\",\"name\":\"${OWNED_TEMPLATE}\",\"description\":\"visibility smoke\",\"image\":\"ubuntu:24.04\",\"visibility\":\"public\",\"defaultEntrypoint\":[\"sleep\",\"3600\"],\"cpuCount\":1,\"memoryMb\":1024,\"runtimeFamily\":\"custom\"}" \
  "${API_URL}/v1/templates")"
OWNED_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.template.id)" "${CREATE_RESPONSE}")"
if [[ "${OWNED_ID}" != "${OWNED_TEMPLATE}" ]]; then
  echo "created owned template id mismatch: ${OWNED_ID}" >&2
  exit 1
fi

BUILD_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H 'content-type: application/json' \
  -d '{"sourceType":"image","imageDestination":"ubuntu:24.04"}' \
  "${API_URL}/v1/templates/${OWNED_TEMPLATE}/builds")"
BUILD_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.id)" "${BUILD_RESPONSE}")"
if [[ -z "${BUILD_ID}" ]]; then
  echo "owned template build did not return a build id" >&2
  exit 1
fi

echo "template visibility smoke passed: ${OWNED_TEMPLATE} ${BUILD_ID}"
