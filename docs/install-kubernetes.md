# Install on Kubernetes

Start with the [public Kubernetes installation guide](https://sb.harakiri.io/#docs/install-kubernetes).
It is a first-class **Self-hosting** page, also linked from the documentation
overview, preview scope and developer quickstart. Installing the SDK/CLI alone
does not install a server or sandbox runtime.

## Choose a Path

| Your situation | Start here |
| --- | --- |
| Empty cluster; evaluate real native sandboxes | [Versioned native reference configuration and commands](../infra/preview/README.md) |
| Existing database, identity and runtime services | [Control-plane chart reference](../infra/charts/harakiri/README.md) and [values](../infra/charts/harakiri/values.yaml) |
| Restricted OpenShift | [Standalone prerequisites and profile limits](install-openshift.md); native egress/Vault privileges are not implied |
| Disconnected or private registry | [Artifact mirroring](airgap.md) and [release inventory](release-artifacts.md) |
| Application team with a running installation | [CLI](cli.md), [SDK](sdk.md) and [quickstart](https://sb.harakiri.io/#docs/quickstart) |
| Contributor developing the product | [Runtime-free local setup](development.md); not sandbox isolation acceptance |
| Qualify recovery and failure behavior | [Coordinated recovery and upgrade qualification](operations/standalone-recovery.md), with explicit evidence limits |

## Complete Operator Journey

The public guide walks through:

1. Select an empty target cluster and check its storage, permissions and resources.
2. Obtain pinned operator source files without building the application.
3. Generate and preserve private configuration with explicit identity origins.
4. Install PostgreSQL and Keycloak, using separate database roles and a
   realm-scoped service identity.
5. Download and inspect the two published charts, then install the runtime and
   Harakiri control plane with matching versioned images and recorded digests.
6. Access the dashboard/API/identity through loopback forwards and finish onboarding.
7. Import the published OpenCode image and run a deterministic file/command/cleanup
   check through the published SDK. No paid model, model account or agent is needed.
8. Understand public ingress, OIDC, troubleshooting, upgrades, recovery and cleanup.

The reference pins Harakiri `0.5.0-rc.9` and OpenSandbox chart
`0.2.2-harakiri.2`. See the [candidate notes](release-notes/0.5.0-rc.9.md)
and artifact receipt attached to its GitHub release. Do not reuse rc.8 overlays.
The native reference is Linux/arm64 on one k0s node with local-path storage.
Multi-architecture images are not proof of native amd64 acceptance, HA or
arbitrary CSI-driver compatibility.

There is no customer bundle or BackgroundAgent dependency. The current runtime
requires cluster-scoped CRDs/RBAC and network privileges for native egress. Do
not alter OpenShift SCCs to make the evaluation profile run. The rc.9 release
enforces organization execution slots; CPU, memory and storage require separate
infrastructure controls. Usage history is unavailable. Restrict preview access
to trusted teams and account for resource consumption independently.

## Capacity Upgrade

Migration 038 in rc.9 adds atomic organization execution admission. Read
[Execution capacity](https://sb.harakiri.io/#docs/execution-capacity) and the
[operator activation and recovery runbook](operations/execution-capacity.md).
Do not use a mixed-version rolling upgrade: stop all older API and scheduler
writers, migrate, verify inventory, then start matching builds. Every preexisting
organization remains closed to new execution until activation succeeds. An image
rollback to a pre-capacity build does not preserve enforcement. Fresh
organizations start enforced. A readiness-aware SDK requires the matching API.

## Documentation Ownership

The public article and executable snippets live in
[`kubernetes-install-docs.tsx`](../apps/web/src/kubernetes-install-docs.tsx).
The web build generates `/docs/install-kubernetes.md`, the docs inventory and
LLM indexes from that same content. This repository page is an entry point, not
a second independently maintained copy of the commands.

The source page is tested for navigation/search/export visibility, shell syntax,
SDK cleanup and the reference profile's safety boundaries. Documentation and
offline Helm validation do not replace a fresh live installation receipt.
