# Kubernetes (real sandboxes)

This installs the reference profile on an **empty, operator-owned** Kubernetes
cluster: PostgreSQL, Keycloak, the maintained OpenSandbox runtime chart and the
Harakiri chart. It is a trusted-team Developer Preview, not a hardened
multi-tenant or highly available profile.

Source of truth, in the tagged clone:

- `infra/preview/README.md`: exact commands, versions and the configuration
  helper.
- `docs/install-kubernetes.md`: which path to choose, plus the capacity-upgrade
  rules.
- `docs/release-notes/`: the published coordinates and the receipt digests.

Public page: `https://sb.harakiri.io/docs/install-kubernetes.md`.

## Requirements

- **Cluster-admin** on the target. The runtime installs CRDs and ClusterRoles.
- A tested default StorageClass. The reference uses `local-path` on a single
  node, which is not highly available.
- Reference allocation: 8 CPU, 16 GiB RAM and 80 GiB disk. This is not a
  measured minimum. Image builds and large agents need more.
- On the workstation: Node.js 22 or newer, `kubectl`, Helm 3 and Git.
- The guide records which architectures were qualified. Do not infer amd64
  results from arm64 tests, or the reverse.

### No cluster yet, on macOS

`infra/preview/README.md` describes a separate Lima + k0s VM with its own
kubeconfig and API port. Use exactly those separate values. **Never** reuse
`infra/k0s/harakiri.kubeconfig`, port 6444 or an existing lab VM, and never
stop, resize or reset a VM you did not create.

## Preflight (read-only)

```bash
K="--kubeconfig $KUBECONFIG --context $CTX"
kubectl $K version
kubectl $K get nodes -o wide
kubectl $K get storageclass
kubectl $K get crd -o name | grep -i sandbox      # must be empty
kubectl $K auth can-i create customresourcedefinitions
kubectl $K auth can-i create clusterroles
kubectl $K describe nodes | grep -A6 'Allocated resources'
```

The result is no-go if a sandbox CRD exists, there is no default StorageClass,
or cluster-scoped permissions are missing.

## Install flow

Follow `infra/preview/README.md` section by section. What each phase does, and
what to watch for:

1. **Configuration.** `node infra/preview/configure.mjs` generates random
   credentials and values into `infra/preview/.private/`. The directory is mode
   0700 and ignored by Git. The helper refuses to overwrite an existing
   directory, and it prints no secrets. Do not read those files aloud or cat
   them.
   - Loopback port-forward origins are the default.
   - For public ingress, set all three `PREVIEW_*_ORIGIN` variables to HTTPS
     origins with no trailing slash, **before** generating. Ingress and TLS are
     provisioned separately.
2. **Dependencies.** Apply the dependency manifests and Secrets, then wait for
   the PostgreSQL and Keycloak rollouts.
   - Never regenerate passwords later. A changed Secret does not change an
     existing database role, and Keycloak skips importing a realm that exists.
3. **Runtime chart.** `helm pull` the maintained `-harakiri.N` OpenSandbox
   chart named by the guide. Compare its digest with the guide or receipt, then
   install the archive.
   - Do not substitute unchanged upstream OpenSandbox. Do not modify or
     repackage the archive.
   - Both subchart namespaces must be set explicitly. The upstream default is
     `opensandbox-system`.
4. **Harakiri chart.** Pull the chart for the pinned version, compare it with
   the receipt, install it and check that all pods are ready.
5. **Access.** Use the port-forwards from the guide, or your ingress. Check
   that OIDC discovery reports the **browser-reachable** issuer, not an
   internal Service address.
   - Never deploy loopback values to a public installation.
6. **Onboarding.** The user signs in with the generated operator login, which
   they read privately. They create a scoped, expiring API key.
7. **Proof.** Install the CLI and SDK at the exact version. Import the template
   image digest named in the receipt, then run the workflow check described in
   SKILL.md step 6.

## Known limits

- **Routes.** Token-protected routes go through the API proxy and work over
  port-forwards. Public wildcard routes need separate ingress or a gateway and
  wildcard DNS.
- **Egress.** Native egress enforcement needs runtime network privileges.
- **Dockerfile builds.** Builds need a registry writer that the reference
  profile does not configure. Image imports work.
- **Execution capacity.** Admission limits concurrent executions only. CPU,
  memory and storage need separate infrastructure controls.

## Troubleshooting

```bash
kubectl $K -n "$NS" get pods
kubectl $K -n "$NS" get events --sort-by=.lastTimestamp | tail -30
kubectl $K -n "$NS" describe pod "$POD"
kubectl $K -n "$NS" logs "$POD" --tail=200
```

Logs can contain application data. Summarize them; do not paste them wholesale.
For capacity-related upgrades, follow `docs/install-kubernetes.md`: stop all
older writers, migrate, verify, then start matching builds. Never run a mixed
version rollout.
