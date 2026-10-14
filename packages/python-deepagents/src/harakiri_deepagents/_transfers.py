from __future__ import annotations

import asyncio
import posixpath
from collections.abc import Iterator
from contextlib import contextmanager

from harakiri.errors import ApiError

from ._execution import Budget
from .errors import (
    HarakiriTransferCancelledError,
    HarakiriTransferError,
    HarakiriTransferInterruptedError,
)


def valid_path(path: str) -> bool:
    return bool(path) and "\0" not in path


def remote_path(cwd: str, path: str) -> str:
    return posixpath.normpath(posixpath.join(cwd, path))


def file_error(error: ApiError) -> str | None:
    # A generic 403/404 could mean the sandbox itself, not a filesystem condition.
    return {
        "file_not_found": "file_not_found",
        "file_permission_denied": "permission_denied",
        "file_is_directory": "is_directory",
        "invalid_file_path": "invalid_path",
    }.get(error.code)


class TransferBatch:
    def __init__(
        self, operation: str, sandbox_id: str, count: int, maximum: int, timeout: float
    ) -> None:
        if count > 64:
            raise ValueError("Transfer batches are limited to 64 files")
        if (
            isinstance(maximum, bool)
            or not isinstance(maximum, int)
            or not 1 <= maximum <= 256 << 20
        ):
            raise ValueError("max_batch_bytes must be between 1 and 256 MiB")
        self.operation, self.sandbox_id, self.maximum = operation, sandbox_id, maximum
        self.completed: list[str] = []
        self.bytes = 0
        self.budget = Budget(timeout)

    def check_bytes(self, size: int) -> None:
        if size < 0 or self.bytes + size > self.maximum:
            raise ValueError("Transfer batch exceeds its aggregate byte limit")

    def complete(self, path: str, size: int) -> None:
        self.check_bytes(size)
        self.bytes += size
        self.completed.append(path)

    @contextmanager
    def item(self, path: str) -> Iterator[None]:
        try:
            yield
        except asyncio.CancelledError as cause:
            raise HarakiriTransferCancelledError(
                self.operation, self.sandbox_id, path, tuple(self.completed)
            ) from cause
        except KeyboardInterrupt as cause:
            raise HarakiriTransferInterruptedError(
                self.operation, self.sandbox_id, path, tuple(self.completed)
            ) from cause
        except Exception as cause:
            raise HarakiriTransferError(
                self.operation, self.sandbox_id, path, tuple(self.completed)
            ) from cause
