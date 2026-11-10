"""Run ownership without global instrumentation or changes to sandbox cleanup."""

from __future__ import annotations

import math
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from functools import partial
from queue import Empty, Queue
from threading import Thread
from typing import Generic, Literal, Protocol, TypeVar

import anyio

from .client import AsyncHarakiriClient
from .sync import HarakiriClient
from .telemetry_models import AgentRun, Capture, Outcome, TelemetryGrant


class TelemetryRuntime(Protocol):
    def force_flush(self, timeout_millis: int = 30000) -> bool: ...
    def shutdown(self) -> None: ...


Runtime = TypeVar("Runtime", bound=TelemetryRuntime)
Diagnostic = Literal["flush_failed", "shutdown_failed", "close_failed", "revoke_failed"]
DiagnosticHandler = Callable[[Diagnostic], None]


@dataclass(frozen=True)
class AgentRecording(Generic[Runtime]):
    run: AgentRun
    runtime: Runtime


def _budget(seconds: float) -> float:
    if not math.isfinite(seconds) or not 0 < seconds <= 30:
        raise ValueError("cleanup_timeout must be between 0 and 30 seconds")
    return seconds


def _diagnose(handler: DiagnosticHandler | None, code: Diagnostic) -> None:
    if handler is not None:
        try:
            handler(code)
        except Exception:
            pass


def _bounded(action: Callable[[], object], seconds: float) -> None:
    # Some third-party providers ignore their timeout. A daemon prevents their
    # cleanup from holding the caller or process open; grants are still revoked.
    result: Queue[BaseException | None] = Queue(maxsize=1)

    def invoke() -> None:
        try:
            if action() is False:
                raise TimeoutError("Telemetry flush did not complete")
        except BaseException as error:
            result.put(error)
        else:
            result.put(None)

    Thread(target=invoke, name="harakiri-telemetry-cleanup", daemon=True).start()
    try:
        error = result.get(timeout=seconds)
    except Empty as error:
        raise TimeoutError("Telemetry cleanup timed out") from error
    if error is not None:
        raise error


def _finish(
    runtime: TelemetryRuntime, owned: bool, seconds: float, diagnostic: DiagnosticHandler | None
) -> None:
    try:
        _bounded(lambda: runtime.force_flush(timeout_millis=max(1, int(seconds * 1000))), seconds)
    except Exception:
        _diagnose(diagnostic, "flush_failed")
    if owned:
        try:
            _bounded(runtime.shutdown, seconds)
        except Exception:
            _diagnose(diagnostic, "shutdown_failed")


@contextmanager
def agent_run(
    client: HarakiriClient,
    name: str,
    sandbox_id: str,
    *,
    runtime: Callable[[TelemetryGrant], Runtime],
    capture: Capture = "metadata",
    ownership: Literal["owned", "borrowed"] = "borrowed",
    cleanup_timeout: float = 5,
    on_diagnostic: DiagnosticHandler | None = None,
) -> Iterator[AgentRecording[Runtime]]:
    """Own the run/grant, not the sandbox. Preserve KeyboardInterrupt and recovery errors."""
    seconds = _budget(cleanup_timeout)
    run = client.agent_runs.create(name, sandbox_id, capture=capture)
    grant: TelemetryGrant | None = None
    acquired: Runtime | None = None
    outcome: Outcome = "unknown"
    try:
        grant = client.agent_runs.grant(run.id, sandbox_id)
        acquired = runtime(grant)
        yield AgentRecording(run, acquired)
        outcome = "succeeded"
    except BaseException as error:
        outcome = "cancelled" if isinstance(error, KeyboardInterrupt) else "failed"
        raise
    finally:
        try:
            if acquired is not None:
                _finish(acquired, ownership == "owned", seconds, on_diagnostic)
        finally:
            try:
                client.agent_runs.close(run.id, outcome, request_timeout=seconds)
            except Exception:
                _diagnose(on_diagnostic, "close_failed")
            if grant is not None:
                try:
                    client.agent_runs.revoke_grant(run.id, grant.id, request_timeout=seconds)
                except Exception:
                    _diagnose(on_diagnostic, "revoke_failed")


@asynccontextmanager
async def async_agent_run(
    client: AsyncHarakiriClient,
    name: str,
    sandbox_id: str,
    *,
    runtime: Callable[[TelemetryGrant], Runtime],
    capture: Capture = "metadata",
    ownership: Literal["owned", "borrowed"] = "borrowed",
    cleanup_timeout: float = 5,
    on_diagnostic: DiagnosticHandler | None = None,
) -> AsyncIterator[AgentRecording[Runtime]]:
    """Cancellation-shielded final flush and revocation; never shuts down borrowed tracing."""
    seconds = _budget(cleanup_timeout)
    run = await client.agent_runs.create(name, sandbox_id, capture=capture)
    grant: TelemetryGrant | None = None
    acquired: Runtime | None = None
    outcome: Outcome = "unknown"
    try:
        grant = await client.agent_runs.grant(run.id, sandbox_id)
        acquired = runtime(grant)
        yield AgentRecording(run, acquired)
        outcome = "succeeded"
    except BaseException as error:
        interrupted = isinstance(error, (KeyboardInterrupt, anyio.get_cancelled_exc_class()))
        outcome = "cancelled" if interrupted else "failed"
        raise
    finally:
        with anyio.CancelScope(shield=True):
            try:
                if acquired is not None:
                    await anyio.to_thread.run_sync(
                        partial(_finish, acquired, ownership == "owned", seconds, on_diagnostic)
                    )
            finally:
                try:
                    await client.agent_runs.close(run.id, outcome, request_timeout=seconds)
                except Exception:
                    _diagnose(on_diagnostic, "close_failed")
                if grant is not None:
                    try:
                        await client.agent_runs.revoke_grant(
                            run.id, grant.id, request_timeout=seconds
                        )
                    except Exception:
                        _diagnose(on_diagnostic, "revoke_failed")
