"""Qualification producer. Never reads application credentials or global OTel config."""

import os
import time

from opentelemetry._logs import LogRecord
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import SimpleLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.trace import Status, StatusCode


def main() -> None:
    endpoint = os.environ["HARAKIRI_QUALIFICATION_ENDPOINT"]
    headers = {
        "Authorization": f"Bearer {os.environ['HARAKIRI_QUALIFICATION_TOKEN']}",
        "x-harakiri-tenant": "106",
        "x-harakiri-org": "org_106",
        "x-harakiri-run": "run_106",
        "x-harakiri-sandbox": "sbx_106",
        "x-harakiri-capture": "metadata",
    }
    resource = Resource({"service.name": "qualification-python", "secret": "PYTHON_CANARY"})
    traces = TracerProvider(resource=resource)
    traces.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter(
        endpoint=f"{endpoint}/v1/traces", headers=headers, timeout=5,
    )))
    logs = LoggerProvider(resource=resource)
    logs.add_log_record_processor(SimpleLogRecordProcessor(OTLPLogExporter(
        endpoint=f"{endpoint}/v1/logs", headers=headers, timeout=5,
    )))
    try:
        started = time.time_ns()
        span = traces.get_tracer("qualification").start_span("python.tool", start_time=started)
        span.set_attribute("gen_ai.operation.name", "execute_tool")
        span.set_attribute("gen_ai.input.messages", "PYTHON_CANARY")
        span.record_exception(ValueError("PYTHON_CANARY"))
        span.set_status(Status(StatusCode.ERROR, "PYTHON_CANARY"))
        identity = span.get_span_context()
        logs.get_logger("qualification").emit(LogRecord(
            timestamp=started, trace_id=identity.trace_id, span_id=identity.span_id,
            body="PYTHON_CANARY", attributes={"secret": "PYTHON_CANARY"},
        ))
        span.end(end_time=started + 100_000_001)
        traces.force_flush(timeout_millis=5000)
        logs.force_flush(timeout_millis=5000)
    finally:
        traces.shutdown()
        logs.shutdown()


if __name__ == "__main__":
    main()
