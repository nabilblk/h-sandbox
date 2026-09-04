# Credential Vault Documentation Inventory

**Last reviewed:** 2026-09-04

This inventory is the release checklist for Credential Vault documentation.
The listed owner is a code ownership role, not a single person. A behavior
change is incomplete until every affected canonical document is updated.

## Vocabulary

Public documentation uses these terms consistently:

- **Vault**: the Harakiri product surface for credential sources and runtime
  attachments.
- **Credential**: authentication material used for one external service.
- **Secret source**: where real material comes from: `inline_ephemeral`,
  `harakiri_encrypted`, `external_ref`, or `dynamic`.
- **Provider preset**: a value-free built-in binding for a known service.
- **Template slot**: a value-free credential requirement declared by a
  template.
- **Attached**: Harakiri has a desired attachment record for a sandbox.
- **Injected**: the runtime provider reports the attachment in its vault.
- **Needs reinjection**: desired state exists but provider state is absent.

Use `secret` only for source custody. Do not call an OpenSandbox sidecar entry
a Harakiri secret, and do not expose provider payload terms as public concepts.

## Inventory

| Canonical artifact | Audience | Owner | Status | Release gate |
| --- | --- | --- | --- | --- |
| `docs/credential-vault.md` | Developers and admins | Product/API | Current | One safe quickstart and complete source matrix |
| `apps/web/src/docs-content.tsx` | Website users | Web/Product | Current | Vault is discoverable and claims match the support matrix |
| `docs/credential-vault-support.md` | All users | Runtime/API | Current | Every runtime profile is classified honestly |
| `docs/credential-vault-cookbook.md` | Developers | SDK/CLI | Current | Model, GitHub, package, private API, registry, and agent examples |
| `docs/api.md` and `docs/openapi.json` | API integrators | API | Current | Every public route, error, pagination shape, and RBAC rule |
| `docs/sdk.md` and `packages/sdk/README.md` | TypeScript users | SDK | Current | Install, auth, all source types, slots, lifecycle, typed failures |
| `docs/cli.md` and `packages/cli/README.md` | CLI and CI users | CLI | Current | Safe input, JSON automation, all source types, cleanup |
| `docs/templates.md` | Template authors | Templates | Current | Built-in and custom slots plus immutable version behavior |
| `docs/egress-control.md` | Developers and operators | Runtime | Current | Vault and outbound policy are explained as one safety boundary |
| `docs/lifecycle.md` | Integrators | Runtime | Current | Resume, restore, reconciliation, and ephemeral behavior |
| `docs/errors.md` | All users | API | Current | Recovery advice for every stable Vault error family |
| `docs/credential-vault-internals.md` | Maintainers | API/Runtime | Current | End-to-end architecture and state transitions |
| `docs/internal/credential-vault-engineering.md` | Maintainers | API/Runtime | Current | Module map, invariants, migration and review checklists |
| `docs/security/credential-vault-threat-model.md` | Security reviewers | Security | Current | Assets, boundaries, threats, controls, residual risks, response |
| `docs/integrations/credential-vault.md` | External integration teams | SDK/API | Current | Provider-neutral contract and handoff checklist |
| `docs/credential-vault-operations.md` | Cluster operators | Operations | Current | Versions, keys, backups, OpenShift, health, incident response |
| `docs/external-secret-references.md` | Operators and admins | Operations/API | Current | Least-privilege Kubernetes and ESO workflow |
| `docs/install-openshift.md` | OpenShift operators | Operations | Current | Restricted profile is explicitly operator-action-required |
| `docs/runbook.md` | Operators | Operations | Current | Day-two checks link to the Vault runbook |
| `docs/release-notes/credential-vault.md` | Upgraders | Release | Current | Scope, migration, limits, verification |
| `docs/test-report.md` | Maintainers and operators | QA | Current | Commands, versions, runtime evidence, limitations |
| ADRs `0006` through `0008` | Maintainers | Architecture | Current | Durable source, custody, provider, and reconciliation decisions |

## Update Rules

1. Change `docs/credential-vault-support.md` first when capability status
   changes. Other documents must not claim broader support.
2. Regenerate `docs/openapi.json` from `packages/shared/src/openapi.ts`; never
   hand-edit generated API JSON.
3. Keep package READMEs usable without the repository docs, but link to the
   canonical guide for operator and security detail.
4. Record live runtime evidence in `docs/test-report.md`; do not encode one
   maintainer cluster's IDs or domains as a portable requirement.
5. Run `pnpm docs:check`, `pnpm openapi:check`, and
   `pnpm credential-vault:check` before release.
