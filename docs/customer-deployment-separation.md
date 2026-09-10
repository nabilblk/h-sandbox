# Customer Deployment Package Separation

The version-specific customer package formerly under `OCP-install/` has moved
to the private [Harakiri deployments repository](https://github.com/nabilblk/harakiri-deployments).
It composes Harakiri Sandbox, BackgroundAgent, PostgreSQL, Keycloak and the
selected runtime for a particular customer environment. Access belongs to the
deployment owner; community users do not need this repository.

## Standalone OSS Installation

Use the public [native Kubernetes evaluation](../infra/preview/README.md),
[Harakiri chart](../infra/charts/harakiri/README.md),
[OpenShift prerequisites](install-openshift.md) and [air-gap guide](airgap.md).
Reusable charts, provider configuration, realm checks and registry mirroring
remain in this OSS repository. Customer composition and acceptance do not gate
Harakiri's independent releases.

## Existing Customer Installations

The extraction starts from public source revision
`8907f2453ca34f79b283278a6fb82bcbb88db7c3`. The initial private commit is
`ccff7eac6a57f8bc911adbdbfe2dbf290203911d`. Runtime scripts, manifests and version
defaults were preserved; documentation and tests were made self-contained.

Only tracked source and its license were transferred. Original local chart
archives, generated credentials and installation state were not moved or
deleted. The entire old local directory remains ignored to protect that state
after its nested ignore file is removed.

Do not run preparation with a new state directory to resume an existing
namespace. The operator must retain the original installation ID, configuration,
chart locks and credentials, secure their backup, and deliberately set the same
absolute `INSTALL_STATE_DIR` when resuming from the new checkout. Git ignores
are not encryption; never force-add rendered Secrets or private state.

This source extraction performed no installation, upgrade, SCC change or
credential rotation. It does not certify the preserved customer versions or
fresh restricted OpenShift support. The private runbook retains those limits.
Moving source does not erase its previously published Git history.

## Contributor Boundary

Customer installer tests run in the private repository. Product realm/audience,
standalone configuration, chart rendering and mirroring checks stay here.
Client-discovered product defects should be reported with a standalone Harakiri
reproduction. Do not restore customer wiring or a required BackgroundAgent
checkout to fix a generic product issue.
