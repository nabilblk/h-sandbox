"""Record observation of a known command; never change execution or recovery semantics."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from opentelemetry.context import Context
from opentelemetry.trace import Span, Status, StatusCode, set_span_in_context

from ._telemetry_logs import RunTelemetry
from .models import ObservedCommand
from .processes import AsyncProcess
from .sync import Process


@contextmanager
def _observation(
    telemetry: RunTelemetry, command_id: str, parent: Context | None
) -> Iterator[Span]:
    span = telemetry.tracer.start_span(
        "Observe sandbox command",
        context=parent if parent is not None else Context(),
        attributes={"harakiri.command.id": command_id, "harakiri.step.kind": "command"},
    )
    try:
        yield span
    except BaseException:
        span.set_status(Status(StatusCode.ERROR))
        span.set_attribute("error.type", "observation_interrupted")
        raise
    finally:
        span.end()


def _result(result: ObservedCommand, span: Span, telemetry: RunTelemetry, output: bool) -> None:
    successful = result.command.status == "succeeded" and result.command.exit_code == 0
    span.set_status(Status(StatusCode.OK if successful else StatusCode.ERROR))
    if not successful:
        span.set_attribute("error.type", "command_not_successful")
    if output and telemetry.capture == "content":
        for stream in ("stdout", "stderr"):
            body = getattr(result.logs, stream)
            if body:
                clipped = body[:4000]
                truncated = getattr(result.logs, f"{stream}_truncated") or len(body) > len(clipped)
                telemetry.log(
                    f"{stream}: {clipped}" + ("\n[output truncated]" if truncated else ""),
                    context=set_span_in_context(span, Context()),
                    command_id=result.command.id,
                )


def observe_recorded_process(
    process: Process,
    telemetry: RunTelemetry,
    *,
    timeout: float = 120,
    parent: Context | None = None,
    include_output: bool = False,
) -> ObservedCommand:
    """Read-only command observation and optional bounded output; errors pass through unchanged."""
    with _observation(telemetry, process.id, parent) as span:
        result = process.observe(timeout=timeout)
        _result(result, span, telemetry, include_output)
        return result


async def async_observe_recorded_process(
    process: AsyncProcess,
    telemetry: RunTelemetry,
    *,
    timeout: float = 120,
    parent: Context | None = None,
    include_output: bool = False,
) -> ObservedCommand:
    with _observation(telemetry, process.id, parent) as span:
        result = await process.observe(timeout=timeout)
        _result(result, span, telemetry, include_output)
        return result
