"""Real Deep Agents callback qualification; scripted decisions, no LLM or sandbox execution."""

import asyncio
import os
from contextlib import contextmanager
from contextvars import ContextVar
from urllib.parse import urlparse

from deepagents import create_deep_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from openinference.instrumentation import TraceConfig
from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

CANARY = "PYTHON_FRAMEWORK_PRIVATE_CONTENT"
current: ContextVar[trace.TracerProvider | None] = ContextVar(
    "qualification_provider", default=None,
)
disabled = trace.NoOpTracerProvider()


class ScopedTracer(trace.Tracer):
    def __init__(self, name, version, schema_url, attributes):
        self.args = (name, version, schema_url, attributes)

    def selected(self):
        return (current.get() or disabled).get_tracer(*self.args)

    def start_span(self, *args, **kwargs):
        return self.selected().start_span(*args, **kwargs)

    @contextmanager
    def start_as_current_span(self, *args, **kwargs):
        with self.selected().start_as_current_span(*args, **kwargs) as span:
            yield span


class ScopedProvider(trace.TracerProvider):
    def get_tracer(self, instrumenting_module_name, instrumenting_library_version=None,
                   schema_url=None, attributes=None):
        return ScopedTracer(instrumenting_module_name, instrumenting_library_version,
                            schema_url, attributes)


class ScriptedModel(BaseChatModel):
    marker: str

    @property
    def _llm_type(self):
        return "observability-qualification"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        message = AIMessage(content="Written", usage_metadata={
            "input_tokens": 20, "output_tokens": 2, "total_tokens": 22,
        }) if any(isinstance(message, ToolMessage) for message in messages) else AIMessage(
            content="", tool_calls=[{
                "name": "write_file", "args": {
                    "file_path": f"/report-{self.marker}.txt", "content": CANARY,
                }, "id": f"tool_{self.marker}", "type": "tool_call",
            }], usage_metadata={"input_tokens": 12, "output_tokens": 8, "total_tokens": 20},
        )
        return ChatResult(generations=[ChatGeneration(message=message)])


async def invoke(marker, provider=None):
    token = current.set(provider)
    try:
        agent = create_deep_agent(model=ScriptedModel(marker=marker), subagents=[])
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": CANARY}]},
            {"run_name": f"qualification-python-{marker}", "recursion_limit": 12},
        )
        assert result["messages"][-1].content == "Written"
    finally:
        current.reset(token)


async def main():
    os.environ["LANGSMITH_TRACING"] = "false"
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    endpoint = os.environ.get("HARAKIRI_QUALIFICATION_ENDPOINT")
    if endpoint:
        assert urlparse(endpoint).hostname == "127.0.0.1"
    original = trace.get_tracer_provider()
    instrumentor = LangChainInstrumentor()
    instrumentor.instrument(tracer_provider=ScopedProvider(), config=TraceConfig(
        hide_inputs=True, hide_outputs=True, hide_input_messages=True, hide_output_messages=True,
    ))
    providers, exporters = [], []
    try:
        for name in ["A", "B"]:
            provider = TracerProvider(resource=Resource({"service.name": "python-deepagents"}))
            exporter = InMemorySpanExporter()
            provider.add_span_processor(SimpleSpanProcessor(exporter))
            providers.append(provider)
            exporters.append(exporter)
            if endpoint:
                grant = os.environ[f"HARAKIRI_QUALIFICATION_TOKEN_{name}"]
                provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
                    endpoint=f"{endpoint}/v1/traces", headers={"Authorization": f"Bearer {grant}"},
                    timeout=3,
                ), max_queue_size=256, max_export_batch_size=64, export_timeout_millis=4000))
        await invoke("unrelated-before")
        assert not any(exporter.get_finished_spans() for exporter in exporters)
        await asyncio.gather(invoke("a", providers[0]), invoke("b", providers[1]))
        for provider in providers:
            assert provider.force_flush(timeout_millis=5000)
        for marker, other, exporter in zip(["a", "b"], ["b", "a"], exporters, strict=True):
            spans = exporter.get_finished_spans()
            assert any(span.name == f"qualification-python-{marker}" for span in spans)
            assert not any(span.name == f"qualification-python-{other}" for span in spans)
            assert any(span.attributes.get("openinference.span.kind") == "LLM" for span in spans)
            assert any(span.attributes.get("openinference.span.kind") == "TOOL" for span in spans)
            assert any(span.attributes.get("llm.token_count.prompt", 0) > 0 for span in spans)
            assert len({span.context.trace_id for span in spans}) == 1
            assert CANARY not in str([dict(span.attributes) for span in spans])
        count = sum(len(exporter.get_finished_spans()) for exporter in exporters)
        await invoke("unrelated-after")
        assert sum(len(exporter.get_finished_spans()) for exporter in exporters) == count
        assert trace.get_tracer_provider() is original
        print("PASS Python Deep Agents concurrent scoped callbacks, model usage and tool spans")
    finally:
        instrumentor.uninstrument()
        for provider in providers:
            provider.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
