"""Typed synchronous facades. Wire behavior and deadlines live in the async resources."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from contextlib import AbstractContextManager
from types import TracebackType
from typing import Generic, TypeVar

import httpx

from ._config import ClientConfig
from ._sync import Bridge
from .client import AsyncHarakiriClient
from .errors import CommandCallbackError
from .files import AsyncFiles
from .models import (
    Capacity,
    CommandLogs,
    CommandReference,
    CommandSummary,
    EgressPolicy,
    FileEntry,
    FileList,
    LogsResponse,
    ObservedCommand,
    Readiness,
    RunResult,
    RuntimeCapabilities,
    SandboxResponse,
    SandboxSummary,
    Template,
    Workspace,
    WorkspacesResponse,
)
from .processes import AsyncProcess, AsyncProcesses
from .resources import AsyncCapacity, AsyncRuntime, AsyncTemplates, AsyncWorkspaces
from .sandboxes import AsyncSandbox, AsyncSandboxes, AsyncSandboxTask

Resource = TypeVar("Resource")


class _Resource(Generic[Resource]):
    def __init__(self, bridge: Bridge, resource: Resource) -> None:
        self._bridge, self._resource = bridge, resource


class Files(_Resource[AsyncFiles]):
    def list(self, path: str = ".", *, request_timeout: float | None = None) -> FileList:
        return self._bridge.call(self._resource.list, path, request_timeout=request_timeout)

    def stat(self, path: str, *, request_timeout: float | None = None) -> FileEntry:
        return self._bridge.call(self._resource.stat, path, request_timeout=request_timeout)

    def read_text(self, path: str, *, request_timeout: float | None = None) -> str:
        return self._bridge.call(self._resource.read_text, path, request_timeout=request_timeout)

    def read_bytes(self, path: str, *, request_timeout: float | None = None) -> bytes:
        return self._bridge.call(self._resource.read_bytes, path, request_timeout=request_timeout)

    def write(
        self,
        path: str,
        content: str | bytes,
        *,
        create_parents: bool = True,
        mode: str | None = None,
        request_timeout: float | None = None,
    ) -> FileEntry:
        return self._bridge.call(
            self._resource.write,
            path,
            content,
            create_parents=create_parents,
            mode=mode,
            request_timeout=request_timeout,
        )

    def mkdir(
        self, path: str, *, recursive: bool = True, request_timeout: float | None = None
    ) -> FileEntry:
        return self._bridge.call(
            self._resource.mkdir, path, recursive=recursive, request_timeout=request_timeout
        )

    def rename(
        self, source: str, destination: str, *, request_timeout: float | None = None
    ) -> FileEntry:
        return self._bridge.call(
            self._resource.rename, source, destination, request_timeout=request_timeout
        )

    def remove(
        self, path: str, *, recursive: bool = False, request_timeout: float | None = None
    ) -> None:
        self._bridge.call(
            self._resource.remove, path, recursive=recursive, request_timeout=request_timeout
        )


class Process(_Resource[AsyncProcess]):
    @property
    def id(self) -> str:
        return self._resource.id

    @property
    def command(self) -> CommandSummary:
        return self._resource.command

    @property
    def reference(self) -> CommandReference:
        return self._resource.reference

    def refresh(self, *, request_timeout: float | None = None) -> CommandSummary:
        return self._bridge.call(self._resource.refresh, request_timeout=request_timeout)

    def logs(
        self,
        *,
        cursor: int | None = None,
        tail: int | None = None,
        request_timeout: float | None = None,
    ) -> CommandLogs:
        return self._bridge.call(
            self._resource.logs, cursor=cursor, tail=tail, request_timeout=request_timeout
        )

    def kill(self, *, request_timeout: float | None = None) -> CommandSummary:
        return self._bridge.call(self._resource.kill, request_timeout=request_timeout)

    def wait(self, *, timeout: float = 120, poll_interval: float = 0.5) -> CommandSummary:
        return self._bridge.call(self._resource.wait, timeout=timeout, poll_interval=poll_interval)

    def observe(self, *, timeout: float = 120, poll_interval: float = 0.5) -> ObservedCommand:
        return self._bridge.call(
            self._resource.observe, timeout=timeout, poll_interval=poll_interval
        )


class Processes(_Resource[AsyncProcesses]):
    def start(
        self,
        command: str,
        *,
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
        stdin: str | None = None,
        request_timeout: float | None = None,
        on_started: Callable[[CommandReference], None] | None = None,
    ) -> Process:
        process = Process(
            self._bridge,
            self._bridge.call(
                self._resource.start,
                command,
                cwd=cwd,
                env=env,
                timeout=timeout,
                stdin=stdin,
                request_timeout=request_timeout,
            ),
        )
        if on_started is not None:
            # Run application persistence callbacks on the caller's thread, not the HTTP portal.
            try:
                on_started(process.reference)
            except Exception as cause:
                raise CommandCallbackError(process.reference) from cause
        return process

    def connect(self, command_id: str, *, request_timeout: float | None = None) -> Process:
        return Process(
            self._bridge,
            self._bridge.call(self._resource.connect, command_id, request_timeout=request_timeout),
        )

    def list(self, *, request_timeout: float | None = None) -> list[CommandSummary]:
        return self._bridge.call(self._resource.list, request_timeout=request_timeout)


class Sandbox(_Resource[AsyncSandbox]):
    def __init__(self, bridge: Bridge, resource: AsyncSandbox) -> None:
        super().__init__(bridge, resource)
        self.files = Files(bridge, resource.files)
        self.processes = Processes(bridge, resource.processes)

    @property
    def id(self) -> str:
        return self._resource.id

    @property
    def workdir(self) -> str:
        return self._resource.workdir

    @property
    def summary(self) -> SandboxSummary:
        return self._resource.summary

    @property
    def creation(self) -> SandboxResponse | None:
        return self._resource.creation

    @property
    def readiness(self) -> Readiness | None:
        return self._resource.readiness

    def refresh(self, *, request_timeout: float | None = None) -> SandboxSummary:
        return self._bridge.call(self._resource.refresh, request_timeout=request_timeout)

    def wait_ready(self, *, timeout: float = 180, poll_interval: float = 0.5) -> Readiness:
        return self._bridge.call(
            self._resource.wait_ready, timeout=timeout, poll_interval=poll_interval
        )

    def wait_terminated(self, *, timeout: float = 90, poll_interval: float = 0.5) -> SandboxSummary:
        return self._bridge.call(
            self._resource.wait_terminated, timeout=timeout, poll_interval=poll_interval
        )

    def kill(self, *, wait: bool = True, timeout: float = 90) -> None:
        self._bridge.call(self._resource.kill, wait=wait, timeout=timeout)

    def renew(self, *, request_timeout: float | None = None) -> None:
        self._bridge.call(self._resource.renew, request_timeout=request_timeout)

    def run(
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
        return self._bridge.call(
            self._resource.run,
            command,
            cwd=cwd,
            env=env,
            stdin=stdin,
            timeout=timeout,
            check=check,
            request_timeout=request_timeout,
        )

    def logs(self, *, request_timeout: float | None = None) -> LogsResponse:
        return self._bridge.call(self._resource.logs, request_timeout=request_timeout)


class SandboxTask:
    def __init__(self, bridge: Bridge, task: AsyncSandboxTask) -> None:
        self._bridge, self._task = bridge, task
        self._context: AbstractContextManager[AsyncSandbox] | None = None

    def __enter__(self) -> Sandbox:
        self._context = self._bridge.context(self._task)
        return Sandbox(self._bridge, self._context.__enter__())

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self._context is not None:
            self._context.__exit__(exc_type, exc, traceback)


class Sandboxes(_Resource[AsyncSandboxes]):
    def list(self, *, request_timeout: float | None = None) -> list[SandboxSummary]:
        return self._bridge.call(self._resource.list, request_timeout=request_timeout)

    def connect(self, sandbox_id: str, *, request_timeout: float | None = None) -> Sandbox:
        return Sandbox(
            self._bridge,
            self._bridge.call(self._resource.connect, sandbox_id, request_timeout=request_timeout),
        )

    def create(
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
    ) -> Sandbox:
        return Sandbox(
            self._bridge,
            self._bridge.call(
                self._resource.create,
                template=template,
                name=name,
                ttl_seconds=ttl_seconds,
                env=env,
                egress=egress,
                workspace_id=workspace_id,
                idempotency_key=idempotency_key,
                wait=wait,
                readiness_timeout=readiness_timeout,
                request_timeout=request_timeout,
            ),
        )

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
    ) -> SandboxTask:
        return SandboxTask(
            self._bridge,
            self._resource.task(
                template=template,
                name=name,
                ttl_seconds=ttl_seconds,
                env=env,
                egress=egress,
                workspace_id=workspace_id,
                readiness_timeout=readiness_timeout,
                cleanup_timeout=cleanup_timeout,
            ),
        )


class Templates(_Resource[AsyncTemplates]):
    def list(self, *, request_timeout: float | None = None) -> list[Template]:
        return self._bridge.call(self._resource.list, request_timeout=request_timeout)

    def get(self, template_id: str, *, request_timeout: float | None = None) -> Template:
        return self._bridge.call(self._resource.get, template_id, request_timeout=request_timeout)


class Workspaces(_Resource[AsyncWorkspaces]):
    def list(self, *, request_timeout: float | None = None) -> WorkspacesResponse:
        return self._bridge.call(self._resource.list, request_timeout=request_timeout)

    def get(self, workspace_id: str, *, request_timeout: float | None = None) -> Workspace:
        return self._bridge.call(self._resource.get, workspace_id, request_timeout=request_timeout)

    def create(self, name: str, *, request_timeout: float | None = None) -> Workspace:
        return self._bridge.call(self._resource.create, name, request_timeout=request_timeout)

    def archive(self, workspace_id: str, *, request_timeout: float | None = None) -> Workspace:
        return self._bridge.call(
            self._resource.archive, workspace_id, request_timeout=request_timeout
        )


class Runtime(_Resource[AsyncRuntime]):
    def capabilities(self, *, request_timeout: float | None = None) -> RuntimeCapabilities:
        return self._bridge.call(self._resource.capabilities, request_timeout=request_timeout)


class OrganizationCapacity(_Resource[AsyncCapacity]):
    def get(self, *, request_timeout: float | None = None) -> Capacity:
        return self._bridge.call(self._resource.get, request_timeout=request_timeout)


class HarakiriClient:
    def __init__(
        self,
        *,
        api_url: str,
        api_key: str,
        request_timeout: float = 120,
        ca_bundle: str | None = None,
        trust_env: bool = False,
        max_response_bytes: int = 24 * 1024 * 1024,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._async = AsyncHarakiriClient(
            api_url=api_url,
            api_key=api_key,
            request_timeout=request_timeout,
            ca_bundle=ca_bundle,
            trust_env=trust_env,
            max_response_bytes=max_response_bytes,
            http_client=http_client,
        )
        self._bridge = Bridge()
        self.sandboxes = Sandboxes(self._bridge, self._async.sandboxes)
        self.templates = Templates(self._bridge, self._async.templates)
        self.workspaces = Workspaces(self._bridge, self._async.workspaces)
        self.runtime = Runtime(self._bridge, self._async.runtime)
        self.capacity = OrganizationCapacity(self._bridge, self._async.capacity)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> HarakiriClient:
        config = ClientConfig.from_env(env)
        return cls(api_url=config.api_url, api_key=config.api_key)

    def __enter__(self) -> HarakiriClient:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        """Close owned HTTP/portal resources, never remote sandboxes or workspaces."""
        self._bridge.close(self._async.close)
