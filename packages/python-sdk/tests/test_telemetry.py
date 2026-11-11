from __future__ import annotations

import asyncio
import json
import time
from threading import Event
from types import SimpleNamespace

import httpx
import pytest
from harakiri import AsyncHarakiriClient, HarakiriClient, TelemetryGrant
from harakiri._telemetry_privacy import CaptureSpanProcessor
from harakiri.models import CommandLogs, CommandSummary, ObservedCommand
from harakiri.telemetry import (
    RunTelemetry,
    agent_run,
    async_agent_run,
    async_observe_recorded_process,
    create_run_tracer_provider,
    observe_recorded_process,
)
from opentelemetry import trace
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import Status, StatusCode
from test_agent_runs import RUN, grant


class Runtime:
    def __init__(self, calls):
        self.calls = calls

    def force_flush(self, timeout_millis=30000):
        self.calls.append("flush")
        assert timeout_millis <= 5000
        return True

    def shutdown(self):
        self.calls.append("shutdown")


def fixture(fail=None):
    calls, outcomes = [], []

    def handle(request):
        operation = "revoke" if request.method == "DELETE" else request.url.path.split("/")[-1]
        calls.append(operation)
        if operation == fail:
            return httpx.Response(503, json={"error": "unavailable"})
        if operation == "close":
            outcomes.append(json.loads(request.content)["outcome"])
        if operation == "grants":
            return httpx.Response(201, json=grant())
        return httpx.Response(200, json={"run": RUN, "ok": True})

    return httpx.AsyncClient(transport=httpx.MockTransport(handle)), calls, outcomes


def test_owned_sync_recording_flushes_closes_and_revokes():
    http, calls, outcomes = fixture()
    with HarakiriClient(api_url="https://api.test", api_key="test", http_client=http) as client:
        with agent_run(
            client, "Agent", "sbx_test", runtime=lambda _: Runtime(calls), ownership="owned"
        ) as recording:
            assert recording.run.id == "run_test"
            calls.append("work")
    assert calls == ["agent-runs", "grants", "work", "flush", "shutdown", "close", "revoke"]
    assert outcomes == ["succeeded"]


def test_keyboard_interrupt_retains_identity_and_cleans_up_borrowed_recording():
    http, calls, outcomes = fixture()
    original = KeyboardInterrupt("original interrupt")
    with HarakiriClient(api_url="https://api.test", api_key="test", http_client=http) as client:
        with pytest.raises(KeyboardInterrupt) as caught:
            with agent_run(client, "Agent", "sbx_test", runtime=lambda _: Runtime(calls)):
                raise original
    assert caught.value is original
    assert calls[-3:] == ["flush", "close", "revoke"]
    assert "shutdown" not in calls
    assert outcomes == ["cancelled"]


def test_setup_failure_releases_acquired_grant_without_invoking_work():
    http, calls, outcomes = fixture()

    def fail(_):
        raise ValueError("provider configuration")

    with HarakiriClient(api_url="https://api.test", api_key="test", http_client=http) as client:
        with pytest.raises(ValueError, match="provider configuration"):
            with agent_run(client, "Agent", "sbx_test", runtime=fail):
                pytest.fail("work must not start")
    assert calls[-2:] == ["close", "revoke"]
    assert outcomes == ["failed"]


@pytest.mark.asyncio
async def test_async_cancellation_is_not_masked_and_cleanup_is_shielded():
    http, calls, outcomes = fixture()
    entered = asyncio.Event()

    async with AsyncHarakiriClient(
        api_url="https://api.test", api_key="test", http_client=http
    ) as client:

        async def work():
            async with async_agent_run(
                client, "Agent", "sbx_test", runtime=lambda _: Runtime(calls), ownership="owned"
            ):
                entered.set()
                await asyncio.sleep(100)

        task = asyncio.create_task(work())
        await entered.wait()
        task.cancel("original cancellation")
        with pytest.raises(asyncio.CancelledError, match="original cancellation"):
            await task
    assert calls[-4:] == ["flush", "shutdown", "close", "revoke"]
    assert outcomes == ["cancelled"]


def test_cleanup_deadline_and_failure_do_not_replace_result_or_original_error():
    http, calls, outcomes = fixture("revoke")
    release = Event()
    diagnostics = []

    class Hung(Runtime):
        def force_flush(self, timeout_millis=30000):
            release.wait(2)
            return True

        def shutdown(self):
            raise ValueError("PRIVATE backend failure")

    original = RuntimeError("command recovery reference")
    try:
        with HarakiriClient(api_url="https://api.test", api_key="test", http_client=http) as client:
            start = time.monotonic()
            with pytest.raises(RuntimeError) as caught:
                with agent_run(
                    client,
                    "Agent",
                    "sbx_test",
                    runtime=lambda _: Hung(calls),
                    ownership="owned",
                    cleanup_timeout=0.01,
                    on_diagnostic=diagnostics.append,
                ):
                    raise original
            assert time.monotonic() - start < 1
            assert caught.value is original
    finally:
        release.set()
    assert outcomes == ["failed"]
    assert diagnostics == ["flush_failed", "shutdown_failed", "revoke_failed"]


def test_provider_is_explicit_and_does_not_replace_global_or_read_resource_environment(monkeypatch):
    monkeypatch.setenv("OTEL_RESOURCE_ATTRIBUTES", "private.key=SHOULD_NOT_EXPORT")
    previous = trace.get_tracer_provider()
    scoped = TelemetryGrant.model_validate(grant()).for_api("https://api.test")
    provider = create_run_tracer_provider(scoped, "python-agent")
    try:
        assert trace.get_tracer_provider() is previous
        assert dict(provider.resource.attributes) == {
            "service.name": "python-agent",
            "harakiri.schema.version": "1",
        }
    finally:
        provider.shutdown()


@pytest.mark.parametrize("capture", ["metadata", "content"])
def test_privacy_precedes_queue_without_mutating_the_existing_application_processor(capture):
    existing, filtered = InMemorySpanExporter(), InMemorySpanExporter()
    provider = TracerProvider(shutdown_on_exit=False)
    provider.add_span_processor(SimpleSpanProcessor(existing))
    provider.add_span_processor(CaptureSpanProcessor(SimpleSpanProcessor(filtered), capture))
    try:
        span = provider.get_tracer("fixture").start_span(
            "model",
            attributes={
                "gen_ai.usage.input_tokens": 23,
                "gen_ai.input.messages": "PRIVATE_PROMPT",
                "input.value": "PRIVATE_FRAMEWORK_INPUT",
                "output.value": "PRIVATE_FRAMEWORK_OUTPUT",
                "api.key": "PRIVATE_KEY",
            },
        )
        span.set_status(Status(StatusCode.ERROR, "PRIVATE_EXCEPTION"))
        span.add_event("PRIVATE_EVENT")
        span.end()
        original, safe = existing.get_finished_spans()[0], filtered.get_finished_spans()[0]
        assert original.attributes["api.key"] == "PRIVATE_KEY"
        assert "api.key" not in safe.attributes
        assert safe.attributes["gen_ai.usage.input_tokens"] == 23
        assert ("gen_ai.input.messages" in safe.attributes) == (capture == "content")
        for key in ("input.value", "output.value"):
            assert (key in safe.attributes) == (capture == "content")
            if capture == "content":
                assert safe.attributes[key] == original.attributes[key]
        assert bool(safe.events) == (capture == "content")
        assert bool(safe.status.description) == (capture == "content")
        assert safe.context.trace_id == original.context.trace_id
    finally:
        provider.shutdown()


def test_clipped_content_retains_an_otlp_partial_record_indicator():
    exported = InMemorySpanExporter()
    provider = TracerProvider(shutdown_on_exit=False)
    provider.add_span_processor(CaptureSpanProcessor(SimpleSpanProcessor(exported), "content"))
    try:
        span = provider.get_tracer("fixture").start_span(
            "Model call", attributes={"gen_ai.input.messages": "x" * 20_000}
        )
        span.end()
        captured = exported.get_finished_spans()[0]
        assert len(captured.attributes["gen_ai.input.messages"]) == 8192
        assert captured.attributes["harakiri.content.truncated"] is True
        assert captured.dropped_attributes == 0
    finally:
        provider.shutdown()


@pytest.mark.parametrize("capture", ["metadata", "content"])
@pytest.mark.asyncio
async def test_sync_and_async_command_recording_keeps_real_status_and_correlated_bounded_output(
    capture,
):
    spans, logs = InMemorySpanExporter(), InMemoryLogRecordExporter()
    tracer_provider = TracerProvider(shutdown_on_exit=False)
    tracer_provider.add_span_processor(SimpleSpanProcessor(spans))
    logger_provider = LoggerProvider(shutdown_on_exit=False)
    logger_provider.add_log_record_processor(SimpleLogRecordProcessor(logs))
    telemetry = RunTelemetry(capture, tracer_provider, logger_provider)
    observed = ObservedCommand(
        command=CommandSummary(
            id="cmd_test",
            sandbox_id="sbx_test",
            status="failed",
            exit_code=None,
            finish_reason="timeout",
        ),
        logs=CommandLogs(
            command_id="cmd_test", stdout="PRIVATE output", stderr="", stdout_truncated=True
        ),
    )

    async def async_observe(**_):
        return observed

    try:
        sync_process = SimpleNamespace(id="cmd_test", observe=lambda **_: observed)
        async_process = SimpleNamespace(id="cmd_test", observe=async_observe)
        assert observe_recorded_process(sync_process, telemetry, include_output=True) is observed
        assert (
            await async_observe_recorded_process(async_process, telemetry, include_output=True)
            is observed
        )
        exported = spans.get_finished_spans()
        assert len(exported) == 2
        assert all(span.status.status_code == StatusCode.ERROR for span in exported)
        assert all(span.attributes["harakiri.command.id"] == "cmd_test" for span in exported)
        records = logs.get_finished_logs()
        assert len(records) == (2 if capture == "content" else 0)
        for record in records:
            assert record.log_record.body == "stdout: PRIVATE output\n[output truncated]"
            assert record.log_record.span_id in {span.context.span_id for span in exported}
        original = KeyboardInterrupt("original reference")

        def interrupt(**_):
            raise original

        with pytest.raises(KeyboardInterrupt) as caught:
            observe_recorded_process(SimpleNamespace(id="cmd_test", observe=interrupt), telemetry)
        assert caught.value is original
    finally:
        telemetry.shutdown()
