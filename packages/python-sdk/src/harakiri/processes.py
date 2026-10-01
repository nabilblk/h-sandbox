"""Tracked commands retain identities across local observers and worker restarts."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping

from ._config import milliseconds, seconds
from ._observation import Deadline
from ._transport import Query, Transport, segment
from .errors import CommandCallbackError, OperationCancelledError, ProtocolError
from .models import (
    CommandLogs,
    CommandReference,
    CommandResponse,
    CommandsResponse,
    CommandSummary,
    ObservedCommand,
)


def command_body(
    command: str,
    cwd: str,
    env: Mapping[str, str] | None,
    timeout: float | None,
    stdin: str | None = None,
) -> dict[str, object]:
    if not command or "\0" in command:
        raise ValueError("command must be nonempty without NUL characters")
    if not cwd.startswith("/") or "\0" in cwd:
        raise ValueError("cwd must be an absolute POSIX path without NUL characters")
    body: dict[str, object] = {"command": command, "cwd": cwd}
    if env is not None:
        body["env"] = dict(env)
    if timeout is not None:
        body["timeoutMs"] = milliseconds(timeout)
    if stdin is not None:
        body["stdin"] = stdin
    return body


class AsyncProcess:
    def __init__(self, transport: Transport, command: CommandSummary) -> None:
        self._transport = transport
        self.command = command
        self._path = f"/v1/sandboxes/{segment(command.sandbox_id)}/commands/{segment(command.id)}"

    @property
    def id(self) -> str:
        return self.command.id

    @property
    def reference(self) -> CommandReference:
        return self.command.reference

    async def refresh(self, *, request_timeout: float | None = None) -> CommandSummary:
        result = await self._transport.request(
            "GET", self._path, CommandResponse, request_timeout=request_timeout
        )
        if result.command.reference != self.reference:
            raise ProtocolError("Command reference does not match the response", method="GET")
        self.command = result.command
        return self.command

    async def logs(
        self,
        *,
        cursor: int | None = None,
        tail: int | None = None,
        request_timeout: float | None = None,
    ) -> CommandLogs:
        params: Query = {}
        for name, value in (("cursor", cursor), ("tail", tail)):
            if value is not None:
                if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                    raise ValueError(f"{name} must be a nonnegative integer")
                params[name] = value
        result = await self._transport.request(
            "GET", self._path + "/logs", CommandLogs, params=params, request_timeout=request_timeout
        )
        if result.command_id != self.id:
            raise ProtocolError("Command reference does not match the response", method="GET")
        return result

    async def kill(self, *, request_timeout: float | None = None) -> CommandSummary:
        result = await self._transport.request(
            "DELETE", self._path, CommandResponse, request_timeout=request_timeout
        )
        if result.command.reference != self.reference:
            raise ProtocolError("Command reference does not match the response", method="DELETE")
        self.command = result.command
        return self.command

    async def wait(self, *, timeout: float = 120, poll_interval: float = 0.5) -> CommandSummary:
        deadline = Deadline(timeout, self.id)
        seconds(poll_interval, "poll_interval")
        while True:
            command = await self.refresh(
                request_timeout=min(deadline.remaining(), self._transport.config.request_timeout)
            )
            deadline.last_status = command.status
            deadline.remaining()
            if command.status in {"succeeded", "failed", "killed"}:
                return command
            await deadline.pause(poll_interval)

    async def observe(self, *, timeout: float = 120, poll_interval: float = 0.5) -> ObservedCommand:
        deadline = Deadline(timeout, self.id)
        command = await self.wait(timeout=deadline.remaining(), poll_interval=poll_interval)
        logs = await self.logs(
            request_timeout=min(deadline.remaining(), self._transport.config.request_timeout)
        )
        deadline.remaining()
        return ObservedCommand(command=command, logs=logs)


class AsyncProcesses:
    def __init__(self, transport: Transport, sandbox_id: str, workdir: str) -> None:
        self._transport = transport
        self._path = f"/v1/sandboxes/{segment(sandbox_id)}/commands"
        self._sandbox_id = sandbox_id
        self._workdir = workdir

    async def start(
        self,
        command: str,
        *,
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
        stdin: str | None = None,
        request_timeout: float | None = None,
        on_started: Callable[[CommandReference], Awaitable[None]] | None = None,
    ) -> AsyncProcess:
        body = command_body(command, self._workdir if cwd is None else cwd, env, timeout, stdin)
        body["detached"] = True
        result = await self._transport.request(
            "POST", self._path, CommandResponse, body=body, request_timeout=request_timeout
        )
        if result.command.sandbox_id != self._sandbox_id:
            raise ProtocolError("Command sandbox does not match the response", method="POST")
        process = AsyncProcess(self._transport, result.command)
        if on_started is not None:
            try:
                await on_started(process.reference)
            except asyncio.CancelledError as cause:
                raise OperationCancelledError(reference=process.reference) from cause
            except Exception as cause:
                raise CommandCallbackError(process.reference) from cause
        return process

    async def connect(
        self, command_id: str, *, request_timeout: float | None = None
    ) -> AsyncProcess:
        result = await self._transport.request(
            "GET",
            self._path + "/" + segment(command_id),
            CommandResponse,
            request_timeout=request_timeout,
        )
        if result.command.sandbox_id != self._sandbox_id or result.command.id != command_id:
            raise ProtocolError("Command reference does not match the response", method="GET")
        return AsyncProcess(self._transport, result.command)

    async def list(self, *, request_timeout: float | None = None) -> list[CommandSummary]:
        result = await self._transport.request(
            "GET", self._path, CommandsResponse, request_timeout=request_timeout
        )
        return result.commands
