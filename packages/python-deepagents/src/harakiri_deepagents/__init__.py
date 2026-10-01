"""Optional Deep Agents backends. Agent/model/checkpoint ownership stays with your app."""

from ._execution import HarakiriExecuteResponse
from .async_backend import AsyncHarakiriSandboxBackend
from .backend import HarakiriSandboxBackend
from .errors import (
    HarakiriExecutionCancelledError,
    HarakiriExecutionError,
    HarakiriTransferCancelledError,
    HarakiriTransferError,
    HarakiriTransferInterruptedError,
)

__all__ = [
    "AsyncHarakiriSandboxBackend",
    "HarakiriSandboxBackend",
    "HarakiriExecuteResponse",
    "HarakiriExecutionCancelledError",
    "HarakiriExecutionError",
    "HarakiriTransferCancelledError",
    "HarakiriTransferError",
    "HarakiriTransferInterruptedError",
]
__version__ = "0.1.0rc1"
