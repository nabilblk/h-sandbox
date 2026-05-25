# ADR 0004: Environment-Specific Examples Stay Out Of Core Docs

## Status
Accepted

## Context
The prototype contains useful harakiri.io, k0s, Cloudflare Tunnel, and DNS
scripts. Those details are valuable as an example environment, but they should
not define the OSS architecture or confuse contributors who want to run
Harakiri elsewhere.

## Decision
Core docs describe reusable architecture, local development, and extension
points without requiring harakiri.io or Cloudflare.

Deployment details for the current lab environment stay under clearly named
example environment paths such as `infra/scripts/env/harakiri/` and any
matching example docs.

## Consequences
- The README and architecture docs should be valid for a generic installation.
- harakiri.io remains a supported example, not a product assumption.
- Smoke scripts should distinguish core checks from environment-specific checks.
