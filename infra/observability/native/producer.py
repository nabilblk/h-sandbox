"""Model-free in-sandbox producer; the host supplies only a short-lived write grant."""

import json
from pathlib import Path

from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

grant_path = Path(".telemetry-grant.json")
options = json.loads(grant_path.read_text())
grant_path.unlink()
provider = TracerProvider(
    resource=Resource({"service.name": "native-sandbox-producer"}), shutdown_on_exit=False
)
provider.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter(**options, timeout=5)))
try:
    with provider.get_tracer("native-acceptance").start_as_current_span("Inside the sandbox"):
        assert 6 * 7 == 42
    assert provider.force_flush(timeout_millis=5000)
finally:
    provider.shutdown()
