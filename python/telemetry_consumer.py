"""Installed optional extra: real OTLP exports to a private loopback receiver."""

from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from harakiri import TelemetryGrant
from harakiri.telemetry import create_run_telemetry
from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import ExportLogsServiceRequest
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.trace import Status, StatusCode, set_span_in_context

received: list[tuple[str, bytes, str | None]] = []


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers["Content-Length"]))
        received.append((self.path, body, self.headers.get("Authorization")))
        self.send_response(200)
        self.send_header("Content-Type", "application/x-protobuf")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *_args: object) -> None:
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
previous = trace.get_tracer_provider()
try:
    for capture in ("metadata", "content"):
        received.clear()
        grant = TelemetryGrant.model_validate(
            {
                "id": "grant_test",
                "token": "htg_FIXTURE",
                "capture": capture,
                "expiresAt": (datetime.now(UTC) + timedelta(minutes=1)).isoformat(),
            }
        ).for_api(f"http://127.0.0.1:{server.server_port}")
        runtime = create_run_telemetry(grant, "installed-consumer")
        try:
            span = runtime.tracer.start_span(
                "Recorded step",
                attributes={"gen_ai.input.messages": "PRIVATE_PROMPT", "api.key": "PRIVATE_KEY"},
            )
            span.set_status(Status(StatusCode.ERROR, "PRIVATE_EXCEPTION"))
            runtime.log("PRIVATE_LOG", context=set_span_in_context(span, Context()))
            span.end()
            assert runtime.force_flush(timeout_millis=4000)
            assert len(received) == 2
            for path, body, authorization in received:
                assert authorization == "Bearer htg_FIXTURE"
                assert b"htg_FIXTURE" not in body and b"PRIVATE_KEY" not in body
                if path.endswith("traces"):
                    request = ExportTraceServiceRequest.FromString(body)
                    exported = request.resource_spans[0].scope_spans[0].spans[0]
                    assert exported.name == "Recorded step"
                    assert (b"PRIVATE_PROMPT" in body) == (capture == "content")
                    assert (b"PRIVATE_EXCEPTION" in body) == (capture == "content")
                else:
                    request = ExportLogsServiceRequest.FromString(body)
                    record = request.resource_logs[0].scope_logs[0].log_records[0]
                    assert record.span_id.hex() == f"{span.get_span_context().span_id:016x}"
                    assert (b"PRIVATE_LOG" in body) == (capture == "content")
            assert trace.get_tracer_provider() is previous
        finally:
            runtime.shutdown()
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)

print(
    "Installed telemetry extra: official exporters, privacy and explicit provider ownership passed."
)
