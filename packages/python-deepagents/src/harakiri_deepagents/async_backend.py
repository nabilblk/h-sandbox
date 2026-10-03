"""Native asyncio backend; no thread-offloaded synchronous network operations."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

import anyio
from deepagents.backends.protocol import (
    DeleteResult,
    FileDownloadResponse,
    FileUploadResponse,
    WriteResult,
)
from harakiri import AsyncSandbox, CommandReference
from harakiri.errors import ApiError

from ._execution import (
    Budget,
    ExecutionOptions,
    HarakiriExecuteResponse,
    duration,
    execution_result,
)
from ._filesystem import GuardedSandbox
from ._transfers import TransferBatch, file_error, remote_path, valid_path
from .errors import HarakiriExecutionCancelledError, HarakiriExecutionError


class AsyncHarakiriSandboxBackend(GuardedSandbox):
    def __init__(
        self,
        sandbox: AsyncSandbox,
        *,
        cwd: str | None = None,
        timeout: float | None = None,
        observation_timeout: float | None = None,
        max_output_bytes: int = 65_536,
        max_batch_bytes: int = 32 << 20,
        transfer_timeout: float = 120,
        on_command_started: Callable[[CommandReference], Awaitable[None]] | None = None,
    ) -> None:
        remote_timeout = (
            sandbox.summary.runtime_metadata.limits.command_timeout_ms / 1000
            if timeout is None
            else timeout
        )
        self._sandbox = sandbox
        self._options = ExecutionOptions(
            sandbox.workdir if cwd is None else cwd,
            remote_timeout,
            remote_timeout + 10 if observation_timeout is None else observation_timeout,
            max_output_bytes,
        )
        self._max_batch_bytes, self._transfer_timeout = max_batch_bytes, transfer_timeout
        TransferBatch("validate", sandbox.id, 0, max_batch_bytes, transfer_timeout)
        self._on_started = on_command_started

    @property
    def id(self) -> str:
        return self._sandbox.id

    async def aexecute(
        self, command: str, *, timeout: int | None = None
    ) -> HarakiriExecuteResponse:
        remote = self._options.timeout if timeout is None else duration(timeout, "timeout")
        budget = Budget(self._options.observation_timeout)
        reference, stage = None, "submission"
        try:
            process = await self._sandbox.processes.start(
                command, cwd=self._options.cwd, timeout=remote, request_timeout=budget.remaining()
            )
            reference, stage = process.reference, "acknowledgement"
            if self._on_started:
                await self._on_started(reference)
            stage = "observation"
            return execution_result(
                await process.observe(timeout=budget.remaining()), self._options.max_output_bytes
            )
        except asyncio.CancelledError as cause:
            raise HarakiriExecutionCancelledError(reference) from cause
        except Exception as cause:
            raise HarakiriExecutionError(stage, reference) from cause

    async def observe(self, reference: CommandReference) -> HarakiriExecuteResponse:
        if reference.sandbox_id != self.id:
            raise ValueError("Command reference belongs to another sandbox")
        budget = Budget(self._options.observation_timeout)
        try:
            process = await self._sandbox.processes.connect(
                reference.command_id, request_timeout=budget.remaining()
            )
            return execution_result(
                await process.observe(timeout=budget.remaining()), self._options.max_output_bytes
            )
        except asyncio.CancelledError as cause:
            raise HarakiriExecutionCancelledError(reference) from cause
        except Exception as cause:
            raise HarakiriExecutionError("observation", reference) from cause

    def execute(self, command: str, *, timeout: int | None = None) -> HarakiriExecuteResponse:
        raise RuntimeError("Use HarakiriSandboxBackend with agent.invoke()")

    async def aupload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        batch = TransferBatch(
            "upload", self.id, len(files), self._max_batch_bytes, self._transfer_timeout
        )
        if any(not isinstance(content, bytes) for _, content in files):
            raise TypeError("Upload contents must be bytes")
        batch.check_bytes(sum(len(content) for _, content in files))
        results = []
        for path, content in files:
            with batch.item(path):
                await anyio.lowlevel.checkpoint()
                if not valid_path(path):
                    results.append(FileUploadResponse(path=path, error="invalid_path"))
                    continue
                try:
                    await self._sandbox.files.write(
                        remote_path(self._options.cwd, path),
                        content,
                        request_timeout=batch.budget.remaining(),
                    )
                    batch.complete(path, len(content))
                    results.append(FileUploadResponse(path=path))
                except ApiError as error:
                    known = file_error(error)
                    if known is None:
                        raise
                    results.append(FileUploadResponse(path=path, error=known))
        return results

    async def adownload_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        batch = TransferBatch(
            "download", self.id, len(paths), self._max_batch_bytes, self._transfer_timeout
        )
        results = []
        for path in paths:
            with batch.item(path):
                await anyio.lowlevel.checkpoint()
                if not valid_path(path):
                    results.append(FileDownloadResponse(path=path, error="invalid_path"))
                    continue
                try:
                    absolute = remote_path(self._options.cwd, path)
                    entry = await self._sandbox.files.stat(
                        absolute, request_timeout=batch.budget.remaining()
                    )
                    if entry.type in {"dir", "directory"}:
                        results.append(FileDownloadResponse(path=path, error="is_directory"))
                        continue
                    batch.check_bytes(entry.size)
                    content = await self._sandbox.files.read_bytes(
                        absolute, request_timeout=batch.budget.remaining()
                    )
                    batch.complete(path, len(content))
                    results.append(FileDownloadResponse(path=path, content=content))
                except ApiError as error:
                    known = file_error(error)
                    if known is None:
                        raise
                    results.append(FileDownloadResponse(path=path, error=known))
        return results

    def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        raise RuntimeError("Use HarakiriSandboxBackend for synchronous transfers")

    def download_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        raise RuntimeError("Use HarakiriSandboxBackend for synchronous transfers")

    async def awrite(self, file_path: str, content: str) -> WriteResult:
        result = (await self.aupload_files([(file_path, content.encode("utf-8"))]))[0]
        return WriteResult(error=result.error, path=None if result.error else file_path)

    async def adelete(self, file_path: str) -> DeleteResult:
        if not valid_path(file_path):
            return DeleteResult(error="invalid_path")
        try:
            await self._sandbox.files.remove(
                remote_path(self._options.cwd, file_path),
                recursive=True,
                request_timeout=self._transfer_timeout,
            )
            return DeleteResult(path=file_path)
        except ApiError as error:
            known = file_error(error)
            if known is None:
                raise
            return DeleteResult(error=known)
