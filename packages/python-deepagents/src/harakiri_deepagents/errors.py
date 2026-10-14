"""Recovery metadata without exposing command text, file contents or credentials."""

from __future__ import annotations

import asyncio

from harakiri import CommandReference
from harakiri.errors import HarakiriError


class HarakiriExecutionError(HarakiriError):
    def __init__(self, stage: str, reference: CommandReference | None) -> None:
        self.stage, self.reference = stage, reference
        super().__init__(f"Agent tool {stage} failed; inspect the cause and acknowledged reference")


class HarakiriExecutionCancelledError(asyncio.CancelledError):
    def __init__(self, reference: CommandReference | None) -> None:
        self.reference = reference
        super().__init__("Local tool observation cancelled; remote work may still be running")


class HarakiriExecutionInterruptedError(KeyboardInterrupt):
    def __init__(self, stage: str, reference: CommandReference | None) -> None:
        self.stage, self.reference = stage, reference
        super().__init__(f"Agent tool {stage} interrupted; remote work may still be running")


class HarakiriTransferError(HarakiriError):
    def __init__(
        self, operation: str, sandbox_id: str, path: str, completed_paths: tuple[str, ...]
    ) -> None:
        self.operation, self.sandbox_id = operation, sandbox_id
        self.path, self.completed_paths = path, completed_paths
        super().__init__(f"Partial {operation}; inspect completed_paths before retrying")


class HarakiriTransferCancelledError(asyncio.CancelledError):
    def __init__(
        self, operation: str, sandbox_id: str, path: str, completed_paths: tuple[str, ...]
    ) -> None:
        self.operation, self.sandbox_id = operation, sandbox_id
        self.path, self.completed_paths = path, completed_paths
        super().__init__(f"Partial {operation} cancelled; inspect completed_paths")


class HarakiriTransferInterruptedError(KeyboardInterrupt):
    def __init__(
        self, operation: str, sandbox_id: str, path: str, completed_paths: tuple[str, ...]
    ) -> None:
        self.operation, self.sandbox_id = operation, sandbox_id
        self.path, self.completed_paths = path, completed_paths
        super().__init__(f"Partial {operation} interrupted; inspect completed_paths")
