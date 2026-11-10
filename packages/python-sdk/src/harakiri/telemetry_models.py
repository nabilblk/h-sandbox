"""Typed agent telemetry contracts; nanosecond timestamps remain exact strings."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Generic, Literal, TypeVar
from urllib.parse import urlsplit

from pydantic import Field, PrivateAttr, SecretStr

from .models import Model

Capture = Literal["metadata", "content"]
Outcome = Literal["unknown", "succeeded", "failed", "cancelled"]


class AgentRun(Model):
    id: str
    name: str
    capture: str
    reported_outcome: str
    sandbox_ids: list[str]
    created_at: datetime
    closed_at: datetime | None
    retained_until: datetime
    expired: bool
    recording: bool
    last_accepted_at: datetime | None
    last_rejected_at: datetime | None
    last_rejection: str | None


class AgentRunResponse(Model):
    run: AgentRun


class AgentRunsResponse(Model):
    runs: list[AgentRun]
    next_cursor: str | None


class AgentRunFilter(Model):
    sandbox_id: str | None = None
    outcome: Outcome | None = None
    search: str | None = Field(default=None, max_length=120)
    limit: int = Field(default=50, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=1024)


class ObservabilityPolicy(Model):
    available: bool
    enabled: bool
    allow_content: bool
    retention_days: int
    can_configure: bool
    can_read_content: bool
    operator_allows_content: bool


class TelemetryWindow(Model):
    from_time: str = Field(alias="from")
    to_time: str = Field(alias="to")


class TelemetryRead(TelemetryWindow):
    limit: int = Field(default=500, ge=1, le=1000)
    trace_id: str | None = None
    span_id: str | None = None
    include_content: bool = False


class TelemetryEvent(Model):
    name: str
    time_unix_nano: str | None
    attributes: dict[str, str] = Field(repr=False)


class TelemetryLink(Model):
    trace_id: str
    span_id: str
    attributes: dict[str, str] = Field(repr=False)


class SpanContent(Model):
    state: str
    attributes: dict[str, str] = Field(repr=False)
    status_message: str | None = Field(repr=False)
    events: list[TelemetryEvent] = Field(repr=False)
    links: list[TelemetryLink] = Field(repr=False)


class TelemetrySpan(Model):
    id: str
    trace_id: str
    span_id: str
    parent_span_id: str | None
    parent: str
    sandbox_id: str
    name: str
    kind: int
    status: str
    start_time_unix_nano: str
    end_time_unix_nano: str | None
    duration_nano: str | None
    service_name: str | None
    scope_name: str | None
    scope_version: str | None
    source: str
    attributes: dict[str, str]
    content: SpanContent = Field(repr=False)
    deliveries: int
    issues: list[str]


class LogContent(Model):
    state: str
    body: str | None = Field(repr=False)
    attributes: dict[str, str] = Field(repr=False)


class TelemetryLog(Model):
    id: str
    time: str
    observed_time_unix_nano: str | None
    sandbox_id: str
    trace_id: str | None
    span_id: str | None
    severity: str
    severity_number: int | None
    service_name: str | None
    source: str
    attributes: dict[str, str]
    content: LogContent = Field(repr=False)
    issues: list[str]


Record = TypeVar("Record", bound=Model)


class TelemetrySnapshot(Model, Generic[Record]):
    records: list[Record]
    window: TelemetryWindow
    read_at: datetime
    consistency: str
    scanned_records: int
    rejected_records: int
    issues: list[str]
    partial: bool


class TelemetryExporterOptions(Model):
    """Explicitly sensitive configuration for an official OTLP/HTTP exporter."""

    endpoint: str
    headers: dict[str, str] = Field(repr=False)


class TelemetryGrant(Model):
    id: str
    expires_at: datetime
    capture: str
    token: SecretStr = Field(repr=False, exclude=True)
    _api_url: str = PrivateAttr(default="")

    def for_api(self, api_url: str) -> TelemetryGrant:
        parsed = urlsplit(api_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "Telemetry requires an HTTP(S) API URL without credentials"
            )
        result = self.model_copy()
        result._api_url = api_url.rstrip("/")
        return result

    def exporter_options(
        self, signal: Literal["traces", "logs"]
    ) -> TelemetryExporterOptions:
        if signal not in {"traces", "logs"}:
            raise ValueError("Unsupported telemetry signal")
        if not self._api_url:
            raise ValueError("Use client.agent_runs.grant to bind the API URL")
        if self.expires_at.tzinfo is None or self.expires_at <= datetime.now(UTC):
            raise ValueError("Telemetry grant expired; request a new grant")
        return TelemetryExporterOptions(
            endpoint=f"{self._api_url}/v1/telemetry/{signal}",
            headers={"Authorization": f"Bearer {self.token.get_secret_value()}"},
        )
