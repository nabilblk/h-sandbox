"""Sandbox handles and explicit disposable ownership."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from types import TracebackType
from uuid import uuid4

import anyio

from ._config import seconds
from ._observation import Deadline
from ._transport import Transport, segment
from .errors import (
    CleanupError,
    OperationCancelledError,
    ProtocolError,
    RequestError,
    RunError,
    SandboxCreationError,
    SandboxStateError,
    UnsupportedError,
)
from .files import AsyncFiles
from .models import (
    EgressPolicy,
    LogsResponse,
    Ok,
    Readiness,
    RunResponse,
    RunResult,
    SandboxesResponse,
    SandboxResponse,
    SandboxSummary,
)
from .processes import AsyncProcesses, command_body


class AsyncSandbox:
    def __init__(
        self, transport: Transport, response: SandboxResponse, *, created: bool = False
    ) -> None:
        self._transport = transport
        self.summary = response.sandbox
        self.readiness = response.readiness
        self.creation = response if created else None
        self._path = f"/v1/sandboxes/{segment(self.id)}"
        self.files = AsyncFiles(
            transport,
            self.id,
            self.workdir,
            self.summary.runtime_metadata.limits.file_artifact_max_bytes,
        )
        self.processes = AsyncProcesses(transport, self.id, self.workdir)

    @property
    def id(self) -> str:
        return self.summary.id

    @property
    def workdir(self) -> str:
        return self.summary.runtime_metadata.workdir

    async def refresh(self, *, request_timeout: float | None = None) -> SandboxSummary:
        response = await self._transport.request(
            "GET", self._path, SandboxResponse, request_timeout=request_timeout
        )
        if response.sandbox.id != self.id:
            raise ProtocolError("Sandbox identity does not match the response", method="GET")
        self.summary = response.sandbox
        self.readiness = None
        return self.summary

    async def wait_ready(self, *, timeout: float = 180, poll_interval: float = 0.5) -> Readiness:
        deadline = Deadline(timeout, self.id)
        seconds(poll_interval, "poll_interval")
        while True:
            response = await self._transport.request(
                "GET",
                self._path + "/readiness",
                SandboxResponse,
                request_timeout=min(deadline.remaining(), self._transport.config.request_timeout),
            )
            if response.sandbox.id != self.id:
                raise ProtocolError("Sandbox identity does not match the response", method="GET")
            self.summary, self.readiness = response.sandbox, response.readiness
            deadline.last_status = self.summary.status
            deadline.remaining()
            if self.readiness is None or self.readiness.status == "unsupported":
                raise UnsupportedError(501, "execution_readiness_unsupported")
            if self.summary.status in {"running", "idle"} and self.readiness.status == "ready":
                return self.readiness
            if self.summary.status in {"terminated", "error"}:
                raise SandboxStateError(self.summary)
            await deadline.pause(poll_interval)

    async def wait_terminated(
        self, *, timeout: float = 90, poll_interval: float = 0.5
    ) -> SandboxSummary:
        deadline = Deadline(timeout, self.id)
        seconds(poll_interval, "poll_interval")
        while True:
            summary = await self.refresh(
                request_timeout=min(deadline.remaining(), self._transport.config.request_timeout)
            )
            deadline.last_status = summary.status
            deadline.remaining()
            if summary.status == "terminated" and summary.capacity_phase == "released":
                return summary
            await deadline.pause(poll_interval)

    async def kill(self, *, wait: bool = True, timeout: float = 90) -> None:
        deadline = Deadline(timeout, self.id)
        await self._transport.request(
            "DELETE",
            self._path,
            Ok,
            request_timeout=min(deadline.remaining(), self._transport.config.request_timeout),
        )
        if wait:
            await self.wait_terminated(timeout=deadline.remaining())

    async def renew(self, *, request_timeout: float | None = None) -> None:
        await self._transport.request(
            "POST", self._path + "/renew", Ok, request_timeout=request_timeout
        )

    async def run(
        self,
        command: str,
        *,
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        stdin: str | None = None,
        timeout: float | None = None,
        check: bool = False,
        request_timeout: float | None = None,
    ) -> RunResult:
        body = command_body(command, self.workdir if cwd is None else cwd, env, timeout, stdin)
        response = await self._transport.request(
            "POST", self._path + "/run", RunResponse, body=body, request_timeout=request_timeout
        )
        result = response.result
        if check and (result.exit_code != 0 or result.finish_reason not in {None, "exit"}):
            raise RunError(result)
        return result

    async def logs(self, *, request_timeout: float | None = None) -> LogsResponse:
        return await self._transport.request(
            "GET", self._path + "/logs", LogsResponse, request_timeout=request_timeout
        )


class AsyncSandboxes:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    async def list(self, *, request_timeout: float | None = None) -> list[SandboxSummary]:
        response = await self._transport.request(
            "GET", "/v1/sandboxes", SandboxesResponse, request_timeout=request_timeout
        )
        return response.sandboxes

    async def connect(
        self, sandbox_id: str, *, request_timeout: float | None = None
    ) -> AsyncSandbox:
        response = await self._transport.request(
            "GET",
            f"/v1/sandboxes/{segment(sandbox_id)}",
            SandboxResponse,
            request_timeout=request_timeout,
        )
        if response.sandbox.id != sandbox_id:
            raise ProtocolError("Sandbox identity does not match the response", method="GET")
        return AsyncSandbox(self._transport, response)

    async def create(
        self,
        *,
        template: str,
        name: str | None = None,
        ttl_seconds: int = 300,
        env: Mapping[str, str] | None = None,
        egress: EgressPolicy | None = None,
        workspace_id: str | None = None,
        idempotency_key: str | None = None,
        wait: bool = True,
        readiness_timeout: float = 180,
        request_timeout: float | None = None,
    ) -> AsyncSandbox:
        if not template.strip():
            raise ValueError("An installed template reference is required")
        if isinstance(ttl_seconds, bool) or not isinstance(ttl_seconds, int) or ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be a positive integer")
        seconds(readiness_timeout, "readiness_timeout")
        key = str(uuid4()) if idempotency_key is None else idempotency_key
        if not key or len(key) > 200 or any(ord(char) < 33 for char in key):
            raise ValueError("idempotency_key must be a nonempty printable token")
        body: dict[str, object] = {
            "template": template,
            "ttlSeconds": ttl_seconds,
            "idempotencyKey": key,
            "wait": False,
        }
        if name is not None:
            body["name"] = name
        if env is not None:
            body["env"] = dict(env)
        if workspace_id is not None:
            body["workspaceId"] = workspace_id
        if egress is not None:
            body["egress"] = egress.model_dump(by_alias=True, exclude_none=True)
        try:
            response = await self._transport.request(
                "POST", "/v1/sandboxes", SandboxResponse, body=body, request_timeout=request_timeout
            )
        except RequestError as error:
            error.idempotency_key = key
            raise
        except asyncio.CancelledError as cause:
            raise OperationCancelledError(idempotency_key=key) from cause
        sandbox = AsyncSandbox(self._transport, response, created=True)
        if wait:
            try:
                await sandbox.wait_ready(timeout=readiness_timeout)
            except asyncio.CancelledError as cause:
                raise OperationCancelledError(
                    sandbox=sandbox.summary, idempotency_key=key
                ) from cause
            except Exception as cause:
                raise SandboxCreationError(sandbox.summary) from cause
        return sandbox

    def task(
        self,
        *,
        template: str,
        name: str | None = None,
        ttl_seconds: int = 300,
        env: Mapping[str, str] | None = None,
        egress: EgressPolicy | None = None,
        workspace_id: str | None = None,
        readiness_timeout: float = 180,
        cleanup_timeout: float = 90,
    ) -> AsyncSandboxTask:
        return AsyncSandboxTask(
            self,
            template=template,
            name=name,
            ttl_seconds=ttl_seconds,
            env=env,
            egress=egress,
            workspace_id=workspace_id,
            readiness_timeout=readiness_timeout,
            cleanup_timeout=cleanup_timeout,
        )


class AsyncSandboxTask:
    """Own one newly acknowledged runtime; a retained workspace is never owned."""

    def __init__(
        self,
        sandboxes: AsyncSandboxes,
        *,
        template: str,
        name: str | None,
        ttl_seconds: int,
        env: Mapping[str, str] | None,
        egress: EgressPolicy | None,
        workspace_id: str | None,
        readiness_timeout: float,
        cleanup_timeout: float,
    ) -> None:
        self._sandboxes = sandboxes
        self._template, self._name = template, name
        self._ttl, self._env, self._egress = ttl_seconds, env, egress
        self._workspace_id = workspace_id
        self._readiness_timeout = seconds(readiness_timeout, "readiness_timeout")
        self._cleanup_timeout = seconds(cleanup_timeout, "cleanup_timeout")
        self._entered = False
        self.sandbox: AsyncSandbox | None = None

    async def __aenter__(self) -> AsyncSandbox:
        if self._entered:
            raise RuntimeError("A sandbox task context cannot be reused")
        self._entered = True
        self.sandbox = await self._sandboxes.create(
            template=self._template,
            name=self._name,
            ttl_seconds=self._ttl,
            env=self._env,
            egress=self._egress,
            workspace_id=self._workspace_id,
            wait=False,
        )
        try:
            await self.sandbox.wait_ready(timeout=self._readiness_timeout)
        except BaseException as primary:
            await self._cleanup(primary)
            raise
        return self.sandbox

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self._cleanup(exc)

    async def _cleanup(self, primary: BaseException | None) -> None:
        if self.sandbox is None:
            return
        sandbox = self.sandbox

        async def terminate() -> None:
            try:
                await sandbox.kill(timeout=self._cleanup_timeout)
            except Exception as cause:
                raise CleanupError(sandbox.summary) from cause

        # A separate task also protects cleanup from direct asyncio Task.cancel().
        with anyio.CancelScope(shield=True):
            cleanup = asyncio.create_task(terminate())
            interrupted: asyncio.CancelledError | None = None
            while not cleanup.done():
                try:
                    await asyncio.shield(cleanup)
                except asyncio.CancelledError as cancellation:
                    interrupted = cancellation
                except Exception:
                    break
            error = cleanup.exception()
        primary = primary if primary is not None else interrupted
        if error is not None:
            if primary is not None:
                raise BaseExceptionGroup(
                    "Task failed and sandbox cleanup is unconfirmed", [primary, error]
                )
            raise error
        if interrupted is not None:
            raise interrupted
