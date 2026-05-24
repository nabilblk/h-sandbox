# Lightweight Plan: Use OpenSandbox Execd Transport

**Created**: 2026-05-24
**Scope**: Replace Harakiri's direct Kubernetes sandbox execution path with the native OpenSandbox endpoint-resolved `execd` transport.
**Estimated**: 1-2 engineering days
**Status**: Completed

## Goal
Harakiri should not use Kubernetes `pods/exec` as the normal way to execute commands in sandboxes. OpenSandbox already owns sandbox data-plane access through `execd`, exposed by resolving sandbox port `44772` with the lifecycle endpoint. This fix makes Harakiri use that OpenSandbox-native path for terminal, filesystem, and metrics behavior. Kubernetes access remains outside the normal sandbox interaction path.

## Steps
- [x] Add an `execd` transport helper in the API that resolves port `44772` through `GET /v1/sandboxes/:opensandboxId/endpoints/44772?use_server_proxy=true`.
- [x] Use the resolved endpoint URL and returned headers when calling `execd` APIs, including `POST /command`, filesystem endpoints, and `GET /metrics`.
- [x] Replace `callExecd()` pod-IP lookup in `apps/api/src/opensandbox.ts` with the endpoint-resolved transport.
- [x] Remove Kubernetes `pods/exec` from the normal `run()` path. If retained, guard it behind an explicit development-only flag such as `OPEN_SANDBOX_ALLOW_K8S_EXEC_FALLBACK=1`.
- [x] Replace filesystem listing via shell `find` with OpenSandbox `execd` filesystem APIs where the API shape supports it. If directory listing is not directly available, use documented `files/search` rather than Kubernetes exec.
- [x] Replace direct Kubernetes pod log reads with OpenSandbox diagnostics API where available, falling back to control-plane sandbox events if diagnostics are unavailable.
- [x] Keep route exposure on the existing OpenSandbox gateway path; this fix is only for terminal/files/logs/metrics transport.
- [x] Tighten Kubernetes RBAC after the code no longer needs sandbox `pods/exec` or direct pod log access in normal operation.
- [x] Update `docs/architecture.md`, `docs/template-runtime-contract.md`, and the active OSS refactor plan to say Harakiri uses OpenSandbox endpoint-resolved `execd`, not Kubernetes `pods/exec`, for normal sandbox interaction.
- [x] Add/update tests for endpoint resolution, `execd` header propagation, command execution parsing, filesystem access, metrics access, and disabled Kubernetes fallback.
- [x] Verify against k0s/OpenSandbox with `OPEN_SANDBOX_ALLOW_FALLBACK=0`: sandbox create, terminal run, Filesystem tab, Logs tab, Metrics tab, route exposure, CLI `run`, and SDK `run`.

## Notes
- OpenSandbox documents `execd-api.yaml` as the API for command execution, filesystem operations, and metrics inside a sandbox. It requires `X-EXECD-ACCESS-TOKEN`.
- OpenSandbox lifecycle API documents `GET /sandboxes/{sandboxId}/endpoints/{port}` and supports `use_server_proxy=true`.
- OpenSandbox JS and Go SDKs resolve `DEFAULT_EXECD_PORT` / `DefaultExecdPort` (`44772`) through the lifecycle endpoint, then construct an `execd` client from the returned endpoint and headers.
- Therefore Kubernetes `pods/exec` in Harakiri is a prototype shortcut, not a justified core control-plane capability.
- In OpenSandbox gateway/header mode, the resolved endpoint includes an `OpenSandbox-Ingress-To` header. Harakiri uses that returned header with the configured internal `OPEN_SANDBOX_GATEWAY_URL` so control-plane-to-`execd` traffic stays inside the OpenSandbox gateway instead of traversing public DNS/Cloudflare.
- Keep any Kubernetes direct access isolated to platform operations such as deployment, builder Jobs, runtime image pull preflight, and optional pre-pull so OSS users do not need to grant the Harakiri API broad sandbox pod permissions for normal operation.

## Outcome
Completed on 2026-05-24.

- `apps/api/src/opensandbox.ts` now resolves `execd` through OpenSandbox endpoint APIs and calls `POST /command`, `GET /files/search`, and `GET /metrics` with returned endpoint headers plus `X-EXECD-ACCESS-TOKEN` when OpenSandbox does not provide one.
- The Kubernetes `pods/exec` fallback and direct sandbox pod log read path were removed from the OpenSandbox adapter. Runtime logs now call OpenSandbox diagnostics when present and otherwise rely on the existing Harakiri control-plane event fallback.
- Gateway/header mode is handled through `OPEN_SANDBOX_GATEWAY_URL` and the returned `OpenSandbox-Ingress-To` header because the current deployed OpenSandbox server-proxy path forwards through the public gateway in this mode.
- `infra/k8s/opensandbox/harakiri-exec-rbac.yaml` no longer grants `pods/exec` or `pods/log` in the `opensandbox` namespace; it keeps pod create/delete/read for template runtime pull preflight and pre-pull only.
- Verification passed: `pnpm --filter @harakiri/api test`, `pnpm --filter @harakiri/api typecheck`, `pnpm typecheck`, `git diff --check`, `pnpm deploy:k0s`, `pnpm ports:restart`, `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke`, `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm smoke:route`, `OPEN_SANDBOX_ALLOW_FALLBACK=0 pnpm e2e`, and a focused deployed runtime probe covering run/files/metrics/logs.
- Direct diagnostics check: the deployed OpenSandbox chart returned `404 Not Found` for `/v1/sandboxes/:id/diagnostics/logs?scope=container`, so the logs tab currently displays real control-plane events until provider diagnostics are available.
