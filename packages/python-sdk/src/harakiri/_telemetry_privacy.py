"""Producer minimization before batching. The gateway still enforces capture policy."""

from __future__ import annotations

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor
from opentelemetry.trace import SpanContext, Status

from .telemetry_models import Capture

METADATA_ATTRIBUTES = frozenset(
    {
        "gen_ai.operation.name",
        "gen_ai.provider.name",
        "gen_ai.system",
        "gen_ai.request.model",
        "gen_ai.response.model",
        "gen_ai.usage.input_tokens",
        "gen_ai.usage.output_tokens",
        "gen_ai.tool.name",
        "error.type",
        "gen_ai.request.temperature",
        "gen_ai.request.top_p",
        "gen_ai.request.max_tokens",
        "gen_ai.response.finish_reasons",
        "gen_ai.response.id",
        "gen_ai.tool.call.id",
        "gen_ai.usage.cache_read.input_tokens",
        "gen_ai.usage.cache_creation.input_tokens",
        "gen_ai.usage.reasoning.output_tokens",
        "harakiri.llm.first_token_ms",
        "harakiri.command.id",
        "harakiri.step.kind",
        "harakiri.attempt",
        "openinference.span.kind",
        "llm.model_name",
        "llm.token_count.prompt",
        "llm.token_count.completion",
        "tool.name",
    }
)
CONTENT_ATTRIBUTES = frozenset(
    {
        "gen_ai.input.messages",
        "gen_ai.output.messages",
        "gen_ai.tool.call.arguments",
        "gen_ai.tool.call.result",
        "gen_ai.system_instructions",
        "gen_ai.tool.definitions",
    }
)


def _without_state(context: SpanContext | None) -> SpanContext | None:
    if context is None:
        return None
    return SpanContext(context.trace_id, context.span_id, context.is_remote, context.trace_flags)


class _CapturedSpan(ReadableSpan):
    """Independent export view; never mutate spans shared with other processors."""

    def __init__(self, source: ReadableSpan, capture: Capture) -> None:
        content = capture == "content"
        allowed = METADATA_ATTRIBUTES | (CONTENT_ATTRIBUTES if content else frozenset())
        attributes = {
            key: value for key, value in (source.attributes or {}).items() if key in allowed
        }
        clipped = False
        for key, value in attributes.items():
            if isinstance(value, str) and len(value) > 8192:
                attributes[key] = value[:8192]
                clipped = True
        if clipped:
            attributes["harakiri.content.truncated"] = True
        super().__init__(
            name=source.name,
            context=_without_state(source.context),
            parent=_without_state(source.parent),
            resource=source.resource,
            attributes=attributes,
            events=source.events if content else (),
            links=source.links if content else (),
            kind=source.kind,
            status=source.status if content else Status(source.status.status_code),
            start_time=source.start_time,
            end_time=source.end_time,
            instrumentation_scope=source.instrumentation_scope,
        )
        self._dropped = (
            source.dropped_attributes,
            source.dropped_events,
            source.dropped_links,
        )

    @property
    def dropped_attributes(self) -> int:
        return self._dropped[0]

    @property
    def dropped_events(self) -> int:
        return self._dropped[1]

    @property
    def dropped_links(self) -> int:
        return self._dropped[2]


class CaptureSpanProcessor(SpanProcessor):
    def __init__(self, delegate: SpanProcessor, capture: Capture) -> None:
        self._delegate, self._capture = delegate, capture

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        self._delegate.on_start(span, parent_context)

    def on_end(self, span: ReadableSpan) -> None:
        self._delegate.on_end(_CapturedSpan(span, self._capture))

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._delegate.force_flush(timeout_millis)

    def shutdown(self) -> None:
        self._delegate.shutdown()
