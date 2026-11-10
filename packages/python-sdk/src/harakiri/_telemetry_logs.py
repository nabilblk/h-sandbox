"""Bounded explicit output capture. No interception of logging, stdout or subprocesses."""

from __future__ import annotations

from dataclasses import dataclass

from opentelemetry._logs import SeverityNumber
from opentelemetry.context import Context
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.trace import Tracer

from .telemetry_models import Capture


@dataclass(frozen=True)
class RunTelemetry:
    capture: Capture
    tracer_provider: TracerProvider
    _logger_provider: LoggerProvider

    @property
    def tracer(self) -> Tracer:
        return self.tracer_provider.get_tracer("harakiri.commands", "1")

    def log(
        self,
        body: str,
        *,
        context: Context | None = None,
        command_id: str | None = None,
        error: bool = False,
    ) -> None:
        if not isinstance(body, str):
            raise TypeError("Telemetry log bodies must be text")
        content = ""
        if self.capture == "content":
            content = body[:4096] + ("\n[output truncated]" if len(body) > 4096 else "")
        attributes = (
            {"harakiri.command.id": command_id, "harakiri.step.kind": "command"}
            if command_id
            else {}
        )
        self._logger_provider.get_logger("harakiri.commands", "1").emit(
            body=content,
            context=context if context is not None else Context(),
            severity_text="ERROR" if error else "INFO",
            severity_number=SeverityNumber.ERROR if error else SeverityNumber.INFO,
            attributes=attributes,
        )

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        budget = max(1, timeout_millis // 2)
        spans = self.tracer_provider.force_flush(budget)
        logs = self._logger_provider.force_flush(budget)
        return spans and logs

    def shutdown(self) -> None:
        try:
            self.tracer_provider.shutdown()
        finally:
            self._logger_provider.shutdown()
