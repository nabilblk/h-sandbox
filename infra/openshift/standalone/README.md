# Standalone Restricted OpenShift Kit

**rc.15 client-test preview. Native validation pending.** Confirm artifact
publication in the [delivery receipt](../../../docs/release-notes/0.5.0-rc.15-delivery.md).
Start with the complete
[OpenShift installation guide](../../../docs/install-openshift.md) and
[qualification checklist](../../../docs/openshift-qualification.md).

This directory is independent of the legacy elevated helper in its parent.
It never invokes that helper or modifies an SCC.

## Operator Flow

1. Prepare PostgreSQL, Keycloak, approved runtime CRD/RBAC, Secret references and
   registry trust with the platform team.
2. Edit a copy of [operator-input.example.json](operator-input.example.json).
   Replace every placeholder digest with a verified rc.15 or reviewed runtime artifact.
3. Generate locally: `node infra/openshift/standalone/configure.mjs operator-input.json openshift-generated`.
4. Review the five output files and render both Helm charts. No cluster contact
   occurs during generation. Existing output directories are never overwritten.
5. Run read-only `preflight.mjs` against an explicitly selected isolated target.
6. Apply the generated network policies and runtime resources, install the
   approved runtime chart, then install Harakiri. Commands are in the full guide.
7. Run the SDK smoke and complete browser, admission and isolation acceptance.

## Files

| File | Purpose |
| --- | --- |
| `configuration.mjs` | Pure input validation and manifest generation; standard Node APIs, no external dependency |
| `configure.mjs` | CLI writes a new private output directory; no installation or network calls |
| `preflight.mjs` | Bounded read-only checks, explicit kubeconfig/context, no Secret values in output |
| `verify.mjs` | Opt-in API smoke using the public SDK; creates and terminates only its own sandbox |
| `*.test.mjs` | Negative input, Helm, privilege, redaction and owned-cleanup contracts |

Run local checks with Node 22+ and Helm 3:

```bash
node --test infra/openshift/standalone/*.test.mjs
```

Do not add credentials to input JSON. Private files may be kept outside the
checkout or under a gitignored `.private/` directory. Generated manifests are
ordinary reviewable Helm values and Kubernetes resources, not imperative patches.

### Maintainer Contract

The runtime image versions and their API/pod-template behavior are reviewed
separately from chart versioning. Any change to provider behavior, security
context, network selectors, Route TLS mode or build permissions requires updated
negative tests and native qualification evidence. Do not mark the plan complete
merely because configuration renders or the API smoke passes.
