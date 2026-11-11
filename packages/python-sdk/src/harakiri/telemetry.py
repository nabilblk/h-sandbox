"""Optional tracing: install h-sandbox[telemetry]; no global provider is initialized."""

from __future__ import annotations

from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanLimits, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from ._telemetry_commands import async_observe_recorded_process, observe_recorded_process
from ._telemetry_lifecycle import (
    AgentRecording,
    Diagnostic,
    TelemetryRuntime,
    agent_run,
    async_agent_run,
)
from ._telemetry_logs import RunTelemetry
from ._telemetry_privacy import CaptureSpanProcessor
from .telemetry_models import TelemetryGrant

__all__ = [
    "AgentRecording",
    "Diagnostic",
    "TelemetryRuntime",
    "agent_run",
    "async_agent_run",
    "create_run_tracer_provider",
    "RunTelemetry",
    "create_run_telemetry",
    "observe_recorded_process",
    "async_observe_recorded_process",
]


def create_run_tracer_provider(
    grant: TelemetryGrant, service_name: str = "harakiri-agent"
) -> TracerProvider:
    """Create a run-local provider with bounded queues and no environment resource detection.

    The write-only grant has a finite lifetime. Long-lived agents must renew their
    grants explicitly instead of treating this short-run helper as permanent auth.
    """
    if not service_name.strip() or len(service_name) > 128:
        raise ValueError("service_name must contain 1-128 characters")
    options = grant.exporter_options("traces")
    provider = TracerProvider(
        resource=Resource({"service.name": service_name, "harakiri.schema.version": "1"}),
        shutdown_on_exit=False,
        span_limits=SpanLimits(
            max_attributes=64, max_attribute_length=8193, max_events=32, max_links=32
        ),
    )
    provider.add_span_processor(
        CaptureSpanProcessor(
            BatchSpanProcessor(
                OTLPSpanExporter(endpoint=options.endpoint, headers=options.headers, timeout=2),
                max_queue_size=64,
                max_export_batch_size=8,
                schedule_delay_millis=500,
                export_timeout_millis=3000,
            ),
            "content" if grant.capture == "content" else "metadata",
        )
    )
    return provider


def create_run_telemetry(
    grant: TelemetryGrant, service_name: str = "harakiri-agent"
) -> RunTelemetry:
    """Explicit run-scoped logs/traces. No global provider or Python logging handler."""
    log_options = grant.exporter_options("logs")
    tracer_provider = create_run_tracer_provider(grant, service_name)
    logger_provider = LoggerProvider(
        resource=Resource({"service.name": service_name}), shutdown_on_exit=False
    )
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(
            OTLPLogExporter(endpoint=log_options.endpoint, headers=log_options.headers, timeout=2),
            max_queue_size=64,
            max_export_batch_size=8,
            schedule_delay_millis=500,
            export_timeout_millis=3000,
        )
    )
    return RunTelemetry(
        "content" if grant.capture == "content" else "metadata", tracer_provider, logger_provider
    )
