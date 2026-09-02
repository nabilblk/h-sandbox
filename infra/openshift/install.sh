#!/usr/bin/env bash
# Harakiri Sandbox — OpenShift installer.
# Deploys the platform onto an OpenShift cluster (CRC or real), pulling images
# from your Harbor mirror. Idempotent: safe to re-run. See README.md.
#
#   Required:  POSTGRES_PASSWORD=... KEYCLOAK_ADMIN_PASSWORD=... ./install.sh
#
# Common overrides (env vars):
#   APPS                 apps wildcard domain (auto-detected from the cluster)
#   HARBOR               registry host                 (default core.campus.clusterdiali.me)
#   HARBOR_PROJECT       Harbor project for images      (default harakiri)
#   CHART_VERSION        harakiri chart version         (default 0.1.0)
#   POSTGRES_IMAGE       OpenShift-friendly postgres    (default RH rhel9/postgresql-16)
#   KEYCLOAK_IMAGE       keycloak image                 (default <harbor>/<proj>/mirror/keycloak:26.4)
#   OPEN_SANDBOX_API_KEY                                (default dev-opensandbox-key)
#   DEPLOY_POSTGRES=0    use external Postgres (then set DATABASE_URL)
#   DEPLOY_KEYCLOAK=0    use external Keycloak
#   HARBOR_TEMPLATE_ROBOT_USER / _PASSWORD   creds for Dockerfile-build image push
set -euo pipefail

HARBOR="${HARBOR:-core.campus.clusterdiali.me}"
HARBOR_PROJECT="${HARBOR_PROJECT:-harakiri}"
CHART_VERSION="${CHART_VERSION:-0.1.0}"
OPEN_SANDBOX_API_KEY="${OPEN_SANDBOX_API_KEY:-dev-opensandbox-key}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-registry.redhat.io/rhel9/postgresql-16:latest}"
KEYCLOAK_IMAGE="${KEYCLOAK_IMAGE:-${HARBOR}/${HARBOR_PROJECT}/mirror/keycloak:26.4}"
OSB_CHART="${OSB_CHART:-https://github.com/opensandbox-group/OpenSandbox/releases/download/helm/opensandbox/0.2.2/opensandbox-0.2.2.tgz}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

c() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARN: %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- preflight ----------
c "Preflight"
command -v oc   >/dev/null || die "oc not found on PATH"
command -v helm >/dev/null || die "helm not found on PATH"
oc whoami >/dev/null 2>&1   || die "not logged in — run: oc login ..."
oc auth can-i create securitycontextconstraints >/dev/null 2>&1 \
  || die "need cluster-admin (cannot create SCCs). On CRC: oc login -u kubeadmin ..."
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}"
: "${KEYCLOAK_ADMIN_PASSWORD:?set KEYCLOAK_ADMIN_PASSWORD}"
APPS="${APPS:-$(oc get ingresses.config.openshift.io/cluster -o jsonpath='{.spec.domain}' 2>/dev/null)}"
[ -n "$APPS" ] || die "could not detect the apps domain; set APPS=apps.<cluster-domain>"
WEB_HOST="harakiri.${APPS}"; API_HOST="harakiri-api.${APPS}"; KC_HOST="keycloak.${APPS}"
echo "  cluster:  $(oc whoami --show-server)"
echo "  apps:     ${APPS}"
echo "  harbor:   ${HARBOR}/${HARBOR_PROJECT}"
echo "  web=https://${WEB_HOST}  api=https://${API_HOST}  keycloak=https://${KC_HOST}"

# ---------- 1. projects ----------
c "Projects"
for ns in harakiri keycloak opensandbox-system opensandbox; do
  oc get project "$ns" >/dev/null 2>&1 || oc new-project "$ns" >/dev/null
  echo "  $ns"
done

# ---------- 2. SCCs ----------
c "SecurityContextConstraints"
oc apply -f "${ROOT}/infra/openshift/scc-buildkit.yaml"
oc apply -f "${ROOT}/infra/openshift/scc-opensandbox-dataplane.yaml"
oc adm policy add-scc-to-user harakiri-buildkit    -z default -n harakiri    >/dev/null
oc adm policy add-scc-to-user opensandbox-dataplane -z default -n opensandbox >/dev/null
echo "  granted harakiri-buildkit -> sa/default (harakiri), opensandbox-dataplane -> sa/default (opensandbox)"

# ---------- 3. secrets ----------
c "Secrets"
DB_URL="${DATABASE_URL:-postgres://harakiri:${POSTGRES_PASSWORD}@harakiri-postgres.harakiri.svc:5432/harakiri}"
oc create secret generic harakiri-api -n harakiri \
  --from-literal=DATABASE_URL="$DB_URL" \
  --from-literal=OPEN_SANDBOX_API_KEY="$OPEN_SANDBOX_API_KEY" \
  --from-literal=KEYCLOAK_ADMIN_USERNAME=admin \
  --from-literal=KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  --dry-run=client -o yaml | oc apply -f - >/dev/null
echo "  secret/harakiri-api"
if [ -n "${HARBOR_TEMPLATE_ROBOT_USER:-}" ] && [ -n "${HARBOR_TEMPLATE_ROBOT_PASSWORD:-}" ]; then
  oc create secret docker-registry harakiri-template-push -n harakiri \
    --docker-server="$HARBOR" --docker-username="$HARBOR_TEMPLATE_ROBOT_USER" \
    --docker-password="$HARBOR_TEMPLATE_ROBOT_PASSWORD" \
    --dry-run=client -o yaml | oc apply -f - >/dev/null
  echo "  secret/harakiri-template-push"
else
  warn "no HARBOR_TEMPLATE_ROBOT_* set — Dockerfile template builds that push to Harbor will need it later"
fi

# ---------- 4. postgres ----------
if [ "${DEPLOY_POSTGRES:-1}" = "1" ]; then
  c "PostgreSQL (${POSTGRES_IMAGE})"
  oc apply -n harakiri -f - <<YAML
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: harakiri-postgres-data, namespace: harakiri }
spec:
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 20Gi } }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: harakiri-postgres, namespace: harakiri }
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector: { matchLabels: { app: harakiri-postgres } }
  template:
    metadata: { labels: { app: harakiri-postgres } }
    spec:
      containers:
        - name: postgres
          image: ${POSTGRES_IMAGE}
          env:
            - { name: POSTGRESQL_USER, value: harakiri }
            - { name: POSTGRESQL_PASSWORD, value: "${POSTGRES_PASSWORD}" }
            - { name: POSTGRESQL_DATABASE, value: harakiri }
          ports: [ { containerPort: 5432 } ]
          readinessProbe: { tcpSocket: { port: 5432 }, initialDelaySeconds: 10, periodSeconds: 5 }
          volumeMounts: [ { name: data, mountPath: /var/lib/pgsql/data } ]
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: harakiri-postgres-data }
---
apiVersion: v1
kind: Service
metadata: { name: harakiri-postgres, namespace: harakiri }
spec:
  selector: { app: harakiri-postgres }
  ports: [ { port: 5432, targetPort: 5432 } ]
YAML
  oc rollout status deploy/harakiri-postgres -n harakiri --timeout=240s
else
  echo "  DEPLOY_POSTGRES=0 — using external DATABASE_URL"
fi

# ---------- 5. keycloak ----------
if [ "${DEPLOY_KEYCLOAK:-1}" = "1" ]; then
  c "Keycloak (${KEYCLOAK_IMAGE}) + realm import"
  oc create configmap harakiri-realm -n keycloak \
    --from-file=harakiri-realm.json="${ROOT}/infra/keycloak/harakiri-realm.json" \
    --dry-run=client -o yaml | oc apply -f - >/dev/null
  oc apply -n keycloak -f - <<YAML
apiVersion: apps/v1
kind: Deployment
metadata: { name: keycloak, namespace: keycloak }
spec:
  replicas: 1
  selector: { matchLabels: { app: keycloak } }
  template:
    metadata: { labels: { app: keycloak } }
    spec:
      containers:
        - name: keycloak
          image: ${KEYCLOAK_IMAGE}
          args: ["start", "--import-realm", "--hostname-strict=false"]
          env:
            - { name: KC_BOOTSTRAP_ADMIN_USERNAME, value: admin }
            - { name: KC_BOOTSTRAP_ADMIN_PASSWORD, value: "${KEYCLOAK_ADMIN_PASSWORD}" }
            - { name: KC_PROXY_HEADERS, value: xforwarded }
            - { name: KC_HTTP_ENABLED, value: "true" }
            - { name: KC_HOSTNAME, value: "https://${KC_HOST}" }
          ports: [ { containerPort: 8080 } ]
          readinessProbe: { httpGet: { path: /realms/master, port: 8080 }, initialDelaySeconds: 20, periodSeconds: 5, failureThreshold: 40 }
          volumeMounts: [ { name: realm, mountPath: /opt/keycloak/data/import, readOnly: true } ]
      volumes:
        - name: realm
          configMap: { name: harakiri-realm }
---
apiVersion: v1
kind: Service
metadata: { name: keycloak, namespace: keycloak }
spec:
  selector: { app: keycloak }
  ports: [ { port: 8080, targetPort: 8080 } ]
YAML
  oc rollout status deploy/keycloak -n keycloak --timeout=300s
  oc create route edge keycloak -n keycloak --service=keycloak --hostname="${KC_HOST}" --port=8080 \
    --dry-run=client -o yaml | oc apply -f - >/dev/null

  c "Keycloak: point the harakiri-web client at the Route hostnames"
  patched=0
  for i in $(seq 1 30); do
    if oc exec -n keycloak deploy/keycloak -- /opt/keycloak/bin/kcadm.sh config credentials \
         --server http://localhost:8080 --realm master --user admin --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
      CID="$(oc exec -n keycloak deploy/keycloak -- /opt/keycloak/bin/kcadm.sh get clients -r harakiri -q clientId=harakiri-web --fields id --format csv --noquotes 2>/dev/null | tr -d '\r' | head -1)"
      if [ -n "${CID}" ]; then
        oc exec -n keycloak deploy/keycloak -- /opt/keycloak/bin/kcadm.sh update "clients/${CID}" -r harakiri \
          -s "redirectUris=[\"https://${WEB_HOST}/*\"]" -s "webOrigins=[\"https://${WEB_HOST}\"]" >/dev/null 2>&1 || true
        oc exec -n keycloak deploy/keycloak -- /opt/keycloak/bin/kcadm.sh update realms/harakiri \
          -s "attributes.frontendUrl=https://${KC_HOST}" >/dev/null 2>&1 || true
        patched=1; break
      fi
    fi
    sleep 5
  done
  [ "$patched" = "1" ] && echo "  harakiri-web redirectUris -> https://${WEB_HOST}/*" \
    || warn "could not auto-patch Keycloak client; do it manually (see README 'Manual follow-ups')"
else
  echo "  DEPLOY_KEYCLOAK=0 — using external Keycloak"
fi

# ---------- 6. opensandbox ----------
c "OpenSandbox runtime"
helm upgrade --install opensandbox "$OSB_CHART" -n opensandbox-system \
  -f "${ROOT}/infra/k8s/opensandbox/opensandbox-values.airgap.yaml" \
  --set opensandbox-server.server.gateway.host="${APPS}" --timeout=8m \
  || warn "OpenSandbox install reported issues — check: oc get pods -n opensandbox-system (OpenShift support is best-effort)"

# ---------- 7. harakiri control plane ----------
c "Harakiri control plane (chart ${CHART_VERSION})"
helm upgrade --install harakiri "oci://${HARBOR}/${HARBOR_PROJECT}/charts/harakiri" --version "${CHART_VERSION}" -n harakiri \
  -f "${ROOT}/infra/openshift/values-openshift.yaml" \
  --set image.registry="${HARBOR}" \
  --set secret.existingSecret=harakiri-api \
  --set config.PUBLIC_WEB_URL="https://${WEB_HOST}" \
  --set config.PUBLIC_API_URL="https://${API_HOST}" \
  --set config.PUBLIC_KEYCLOAK_URL="https://${KC_HOST}" \
  --set config.KEYCLOAK_ISSUER="https://${KC_HOST}/realms/harakiri" \
  --set config.KEYCLOAK_JWKS_URL="https://${KC_HOST}/realms/harakiri/protocol/openid-connect/certs" \
  --set config.KEYCLOAK_ISSUER_ALLOWLIST="https://${KC_HOST}/realms/harakiri" \
  --set config.KEYCLOAK_INVITATION_REDIRECT_URI="https://${WEB_HOST}/#dashboard/sandboxes" \
  --set config.OPEN_SANDBOX_BASE_URL="http://opensandbox-server.opensandbox-system.svc:80" \
  --set config.OPEN_SANDBOX_GATEWAY_URL="http://opensandbox-ingress-gateway.opensandbox-system.svc:80" \
  --set config.SANDBOX_ROUTE_MODE="opensandbox-gateway" \
  --set config.SANDBOX_ROUTE_BASE_DOMAIN="${APPS}" \
  --set config.SANDBOX_ROUTE_PUBLIC_SCHEME="https" \
  --timeout=8m

# ---------- 8. routes ----------
c "Routes"
oc create route edge harakiri-web -n harakiri --service=harakiri-web --hostname="${WEB_HOST}" --port=http \
  --dry-run=client -o yaml | oc apply -f - >/dev/null
oc create route edge harakiri-api -n harakiri --service=harakiri-api --hostname="${API_HOST}" --port=http \
  --dry-run=client -o yaml | oc apply -f - >/dev/null
oc patch ingresscontroller/default -n openshift-ingress-operator --type=merge \
  -p '{"spec":{"routeAdmission":{"wildcardPolicy":"WildcardsAllowed"}}}' >/dev/null 2>&1 || true
oc apply -n opensandbox-system -f - <<YAML
apiVersion: route.openshift.io/v1
kind: Route
metadata: { name: sandbox-wildcard, namespace: opensandbox-system }
spec:
  host: wildcard.${APPS}
  wildcardPolicy: Subdomain
  to: { kind: Service, name: opensandbox-ingress-gateway }
  port: { targetPort: 80 }
  tls: { termination: edge }
YAML
echo "  web/api Routes + *.${APPS} sandbox wildcard"

# ---------- 9. wait ----------
c "Waiting for the control plane"
for d in harakiri-api harakiri-web harakiri-scheduler harakiri-template-builder; do
  oc rollout status "deploy/${d}" -n harakiri --timeout=240s || warn "deploy/${d} not Ready — oc -n harakiri describe deploy/${d}"
done

# ---------- done ----------
c "Done"
cat <<EOF
  Dashboard : https://${WEB_HOST}
  API       : https://${API_HOST}
  Keycloak  : https://${KC_HOST}   (admin / \$KEYCLOAK_ADMIN_PASSWORD)

Manual follow-ups:
  1. Create a login user in the Keycloak 'harakiri' realm (or verify the imported one),
     then sign in at https://${WEB_HOST}.
  2. Smoke test:
       curl -fsS https://${API_HOST}/health
       # create an API key in the dashboard, then exercise the CLI/SDK against the API URL
  3. Verify the two risky paths (see docs/install-openshift.md if either fails):
       Template build (BuildKit SCC):  oc -n harakiri get jobs,pods
       Sandbox + egress (NET_ADMIN):   oc -n opensandbox get pods
EOF
