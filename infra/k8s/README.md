# Local Kubernetes Manifests

This directory contains local development dependencies and OpenSandbox helper
manifests used by the k0s scripts.

Harakiri itself is installed with the Helm chart in `infra/charts/harakiri`.
Do not add the Harakiri API, web, scheduler, or template-builder workloads to
`kustomization.yaml`; that creates drift between local development and the
release artifact operators install.

The legacy manifest under `harakiri/` is kept only as a reference while older
local environments are migrated to Helm.
