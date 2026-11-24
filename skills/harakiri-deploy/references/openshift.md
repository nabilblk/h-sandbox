# Restricted OpenShift

This deploys the standalone control plane under the **default restricted SCC**
with two reviewed Helm charts, existing PostgreSQL and existing Keycloak. There
is no installer, no SCC change and no post-install patching.

**Tell the user this first.** Read the status line of the tagged
`docs/install-openshift.md`. If native qualification
(`docs/openshift-qualification.md`) is still "not run", this path is a
**client-test preview** for an approved, isolated cluster, not a production
rollout. Generation, rendering and preflight never count as qualification.

Source of truth, in the tagged clone:

- `docs/install-openshift.md`: commands, contracts and diagnosis.
- `infra/openshift/standalone/`: the configuration kit.
- `docs/openshift-qualification.md`: the native acceptance checklist.

Use the release the guide names, or a later one. Its API must enforce
`RUNTIME_DISABLED_FEATURES`. Never combine these values with an older API that
ignores the restriction guard.

## What the restricted profile disables

These are disabled, not broken:

- pause/resume, snapshots and restore;
- mutable domain egress and runtime Vault injection;
- persistent workspaces;
- in-cluster Dockerfile builds, image pre-pull and node collectors.

Disabled features return `runtime_feature_unavailable`, and
`harakiri capabilities` reports them. Templates are **image-backed**: build
them outside the cluster. Isolation is standard containers under the SCC, not
microVMs.

## Two roles

Work out which role the user has. A namespace operator cannot do the platform
administrator's part. In that case, **produce a handoff checklist** for the
administrator instead of trying with insufficient rights.

**Platform administrator:**

- an isolated target and a fresh namespace with restricted SCC admission,
  quotas and capacity;
- approval of the runtime chart's CRDs and cluster RBAC;
- node registry trust and pull access, DNS, the router certificate and a CNI
  that enforces NetworkPolicy;
- PostgreSQL 16 with a dedicated role that has DDL rights and `pgcrypto`, plus
  TLS and backups;
- a Keycloak realm on an HTTPS origin reachable from browsers and API pods.

The administrator also installs the runtime chart and applies the generated
network policies and runtime resources.

**Namespace operator:** delivers Secrets, generates and reviews values,
installs the Harakiri chart, imports templates, runs verification and fills
in the qualification receipt.

## Secrets contract

The user creates these through their Secret manager **before** installing. The
guide's Secret contract table lists the default names and required keys:

- `harakiri-api`
- `opensandbox-api-key`
- `opensandbox-gateway-signing`
- `registry-pull`
- an optional CA ConfigMap

Never generate values in the conversation. Never put them in Git, Helm values,
flags or the receipt. The preflight checks **key names only**. Non-secret
configuration must not go in the API Secret, because Secret values override
the reviewed ConfigMap.

The identity contract is also in the guide: a public PKCE client
`harakiri-web`, the `harakiri-api` audience, and exact origins and redirects.
Invitations need an optional confidential admin client and SMTP.

## Flow

1. **Pin.** Clone the tag and `helm pull` both charts at the guide's versions.
   Compare the chart and image digests with the delivery receipt. Never rebuild
   images to change origins.
2. **Generate.**
   - Copy `operator-input.example.json` to `operator-input.json`.
   - Fill in the origins, namespace, registry, Secret references and
     **verified** digests.
   - Run `configure.mjs` into a **new** output directory.

   It refuses plaintext credentials, loopback origins, placeholder digests,
   unbounded egress CIDRs and existing directories. For a revision, generate a
   new directory and diff the two.
3. **Preflight.** `preflight.mjs` is read-only and bounded. Keep
   `preflight.json`.
4. **Render and review offline.** Run `helm template` on both archives as the
   guide shows, then check what was rendered:

   ```bash
   grep -nE 'privileged: true|allowPrivilegeEscalation: true|hostNetwork|hostPath|hostPID|runAsUser:|fsGroup:|Unconfined|kind: SecurityContextConstraints' openshift-generated/review-*.yaml
   ```

   Any hit needs an explanation before you proceed. Review the CRDs and RBAC
   with the administrator. A server dry-run of a Deployment does not exercise
   SCC admission of the pods its controller creates later.
5. **Install** (after approval). The administrator applies the network
   policies and runtime resources, then installs the runtime chart. The
   operator then installs the Harakiri chart. Pass `--kubeconfig` and
   `--context` on every `oc` and `helm` call.
6. **First sandbox.**
   - Sign in, create a scoped, expiring key, then run `harakiri doctor` and
     `harakiri capabilities`.
   - Import a digest-pinned template image. It must run under an arbitrary UID
     with group-0-writable HOME and workdir, with no sudo, no privileged ports
     and no root-only setup.
   - Run the kit's `verify.mjs` smoke as the guide shows. It creates its own
     sandbox, checks it and confirms deletion.
7. **Qualification.** The SDK smoke is not the full gate. Work through
   `docs/openshift-qualification.md`, recording passed, failed or not run for
   each gate. `qualification.json` stays `native-validation-pending` until
   there are observed results.

## Diagnosis

Use the guide's symptom table. The usual causes:

| Symptom | Look at first |
| --- | --- |
| SCC denied | Fixed IDs, init containers or capabilities in the pod spec. Never grant `anyuid` or `privileged`. |
| Login goes to localhost, or API 401 | Web `config.js`, issuer and redirects, the API audience, or a Secret overriding configuration |
| Sandbox stays "preparing" | Writable HOME/workdir under the assigned UID, resources, or NetworkPolicy. A template that needs root is incompatible. |
| Outbound blocked | DNS and the approved CIDRs. No egress sidecar does not mean open networking. |
| Terminal or service disconnects | Router WebSocket timeouts and token lifetime. Never expose the private gateway. |

For uninstall and upgrade, follow the guide's operate section. Terminate
sandboxes first. Never delete namespaces, CRDs or SCCs as a shortcut.
