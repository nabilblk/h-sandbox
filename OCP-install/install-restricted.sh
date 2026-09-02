#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf "OCP-install/install-restricted.sh is a compatibility wrapper.\n"
printf "Running the canonical one-namespace installer: OCP-install/harakiri-security/install.sh\n\n"

exec "${ROOT}/OCP-install/harakiri-security/install.sh" "$@"
