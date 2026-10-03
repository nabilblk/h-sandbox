"""Request-local adaptation of public BaseSandbox methods, without copying its scripts."""

from __future__ import annotations

from dataclasses import replace

from deepagents.backends.protocol import (
    EditResult,
    ExecuteResponse,
    FileDownloadResponse,
    FileUploadResponse,
    GlobResult,
    GrepResult,
    LsResult,
    ReadResult,
)
from deepagents.backends.sandbox import BaseSandbox

from ._execution import HarakiriExecuteResponse


class _IncompleteOutput(Exception):
    """Stop parsing a clipped helper payload before upstream can treat it as complete."""


class _Capture(BaseSandbox):
    def __init__(
        self, backend: BaseSandbox, *, complete_lines: bool = False, require_complete: bool = False
    ) -> None:
        self.backend = backend
        self.truncated = False
        self.abnormal = False
        self.complete_lines = complete_lines
        self.require_complete = require_complete

    @property
    def id(self) -> str:
        return self.backend.id

    def _record(self, result: ExecuteResponse) -> ExecuteResponse:
        self.truncated |= result.truncated
        self.abnormal |= isinstance(result, HarakiriExecuteResponse) and result.abnormal
        if self.require_complete and self.error:
            raise _IncompleteOutput(self.error)
        if result.truncated and self.complete_lines:
            end = result.output.rfind("\n")
            return replace(result, output=result.output[: end + 1] if end >= 0 else "")
        return result

    def execute(self, command: str, *, timeout: int | None = None) -> ExecuteResponse:
        return self._record(self.backend.execute(command, timeout=timeout))

    async def aexecute(self, command: str, *, timeout: int | None = None) -> ExecuteResponse:
        return self._record(await self.backend.aexecute(command, timeout=timeout))

    def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        return self.backend.upload_files(files)

    async def aupload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        return await self.backend.aupload_files(files)

    def download_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        return self.backend.download_files(paths)

    async def adownload_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        return await self.backend.adownload_files(paths)

    @property
    def error(self) -> str | None:
        if self.abnormal:
            return "Filesystem helper did not complete normally; results are unconfirmed."
        if self.truncated:
            return "Filesystem response was truncated; request a smaller range or narrower path."
        return None


class GuardedSandbox(BaseSandbox):
    """Only the upstream methods that drop execution status need local adaptation."""

    def grep(
        self,
        pattern: str,
        path: str | None = None,
        glob: str | None = None,
        *,
        max_count: int | None = None,
    ) -> GrepResult:
        capture = _Capture(self, complete_lines=True)
        result = BaseSandbox.grep(capture, pattern, path, glob, max_count=max_count)
        if capture.abnormal:
            return GrepResult(error=capture.error, truncated=capture.truncated)
        return replace(result, truncated=result.truncated or capture.truncated)

    async def agrep(
        self,
        pattern: str,
        path: str | None = None,
        glob: str | None = None,
        *,
        max_count: int | None = None,
    ) -> GrepResult:
        capture = _Capture(self, complete_lines=True)
        result = await BaseSandbox.agrep(capture, pattern, path, glob, max_count=max_count)
        if capture.abnormal:
            return GrepResult(error=capture.error, truncated=capture.truncated)
        return replace(result, truncated=result.truncated or capture.truncated)

    def glob(self, pattern: str, path: str | None = None) -> GlobResult:
        capture = _Capture(self)
        result = BaseSandbox.glob(capture, pattern, path)
        return GlobResult(error=capture.error) if capture.abnormal else result

    async def aglob(self, pattern: str, path: str | None = None) -> GlobResult:
        capture = _Capture(self)
        result = await BaseSandbox.aglob(capture, pattern, path)
        return GlobResult(error=capture.error) if capture.abnormal else result

    def ls(self, path: str) -> LsResult:
        try:
            return BaseSandbox.ls(_Capture(self, require_complete=True), path)
        except _IncompleteOutput as error:
            return LsResult(error=str(error))

    async def als(self, path: str) -> LsResult:
        try:
            return await BaseSandbox.als(_Capture(self, require_complete=True), path)
        except _IncompleteOutput as error:
            return LsResult(error=str(error))

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        try:
            return BaseSandbox.read(_Capture(self, require_complete=True), file_path, offset, limit)
        except _IncompleteOutput as error:
            return ReadResult(error=str(error))

    async def aread(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        try:
            return await BaseSandbox.aread(
                _Capture(self, require_complete=True), file_path, offset, limit
            )
        except _IncompleteOutput as error:
            return ReadResult(error=str(error))

    def edit(
        self, file_path: str, old_string: str, new_string: str, replace_all: bool = False
    ) -> EditResult:
        try:
            return BaseSandbox.edit(
                _Capture(self, require_complete=True),
                file_path,
                old_string,
                new_string,
                replace_all,
            )
        except _IncompleteOutput as error:
            return EditResult(error=str(error))

    async def aedit(
        self, file_path: str, old_string: str, new_string: str, replace_all: bool = False
    ) -> EditResult:
        try:
            return await BaseSandbox.aedit(
                _Capture(self, require_complete=True),
                file_path,
                old_string,
                new_string,
                replace_all,
            )
        except _IncompleteOutput as error:
            return EditResult(error=str(error))
