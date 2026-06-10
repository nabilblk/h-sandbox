#!/bin/sh
# Regenerate the dashboard's runtime config from environment variables so a
# single published image works in any environment. The nginx base image runs
# every /docker-entrypoint.d/*.sh before starting nginx.
set -eu

target="${HARAKIRI_WEB_ROOT:-/usr/share/nginx/html}/config.js"

cat > "$target" <<EOF
window.__HARAKIRI_CONFIG__ = {
  PUBLIC_API_URL: "${PUBLIC_API_URL:-}",
  PUBLIC_WEB_URL: "${PUBLIC_WEB_URL:-}",
  PUBLIC_KEYCLOAK_URL: "${PUBLIC_KEYCLOAK_URL:-}",
  PUBLIC_KEYCLOAK_REALM: "${PUBLIC_KEYCLOAK_REALM:-}",
  PUBLIC_KEYCLOAK_CLIENT_ID: "${PUBLIC_KEYCLOAK_CLIENT_ID:-}",
  PUBLIC_KEYCLOAK_SILENT_CHECK_SSO: "${PUBLIC_KEYCLOAK_SILENT_CHECK_SSO:-}"
};
EOF

echo "[harakiri] wrote runtime web config to $target"
