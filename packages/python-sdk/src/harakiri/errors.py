"""Public errors never include raw response bodies, commands or credentials in repr."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Capacity, CommandReference, RunResult, SandboxSummary


class HarakiriError(Exception):
    """Base class for SDK failures; remote effects may already have occurred."""


class ApiError(HarakiriError):
    def __init__(self, status: int, code: str, *, capacity: Capacity | None = None) -> None:
        self.status = status
        self.code = code
        self.capacity = capacity
        super().__init__(f"Harakiri API {status}: {code}")


class AuthenticationError(ApiError):
    """The API key was not accepted."""


class AuthorizationError(ApiError):
    """The identity lacks permission; do not retry with guessed resource IDs."""


class ValidationError(ApiError):
    """The server rejected the request arguments."""


class NotFoundError(ApiError):
    """The requested resource was not found; not proof of successful cleanup."""


class ConflictError(ApiError):
    """The operation conflicts with current resource state."""


class CapacityError(ApiError):
    """Organization admission was rejected; optional capacity data is preserved."""


class RateLimitError(ApiError):
    """The server rate-limited the request."""


class UnsupportedError(ApiError):
    """The server/provider does not support the operation."""


class ProviderError(ApiError):
    """Provider availability prevents confirming the requested result."""


class RequestError(HarakiriError):
    def __init__(self, message: str, *, method: str) -> None:
        self.method = method
        self.outcome_unknown = method not in {"GET", "HEAD"}
        self.idempotency_key: str | None = None
        super().__init__(message)


class RequestTimeoutError(RequestError):
    """The local request deadline expired, not necessarily the remote operation."""


class ProtocolError(RequestError):
    """The bounded response did not satisfy the expected wire contract."""


class IntegrityError(HarakiriError):
    """Transferred bytes failed size, encoding or checksum validation."""


class ObservationTimeoutError(HarakiriError):
    def __init__(self, resource_id: str, last_status: str | None = None) -> None:
        self.resource_id = resource_id
        self.last_status = last_status
        super().__init__("Observation expired; reconnect to the existing resource, do not resubmit")


class SandboxStateError(HarakiriError):
    def __init__(self, sandbox: SandboxSummary) -> None:
        self.sandbox = sandbox
        super().__init__("Sandbox did not reach execution readiness; inspect its state")


class SandboxCreationError(HarakiriError):
    def __init__(self, sandbox: SandboxSummary) -> None:
        self.sandbox = sandbox
        super().__init__("Sandbox creation was acknowledged but readiness was not confirmed")


class CleanupError(HarakiriError):
    def __init__(self, sandbox: SandboxSummary) -> None:
        self.sandbox = sandbox
        super().__init__(
            "Sandbox cleanup is unconfirmed; retain its ID and inspect before retrying"
        )


class RunError(HarakiriError):
    def __init__(self, result: RunResult) -> None:
        self.result = result
        super().__init__("Command did not complete successfully; inspect the attached result")


class CommandCallbackError(HarakiriError):
    def __init__(self, reference: CommandReference) -> None:
        self.reference = reference
        super().__init__("Command was acknowledged but its persistence callback failed")


class OperationCancelledError(asyncio.CancelledError):
    """Cancellation preserves acknowledged identities without suppressing cancellation."""

    def __init__(
        self,
        *,
        sandbox: SandboxSummary | None = None,
        reference: CommandReference | None = None,
        idempotency_key: str | None = None,
    ) -> None:
        self.sandbox = sandbox
        self.reference = reference
        self.idempotency_key = idempotency_key
        super().__init__("Local operation cancelled; remote effects may still exist")
