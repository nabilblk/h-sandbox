"""Optional run control and reads; never initializes a global tracer or exporter."""

from __future__ import annotations

from ._transport import Transport, segment
from .models import Ok
from .telemetry_models import (
    AgentRun,
    AgentRunFilter,
    AgentRunResponse,
    AgentRunsResponse,
    Capture,
    ObservabilityPolicy,
    Outcome,
    TelemetryGrant,
    TelemetryLog,
    TelemetryRead,
    TelemetrySnapshot,
    TelemetrySpan,
)


def run_path(run_id: str) -> str:
    return f"/v1/agent-runs/{segment(run_id)}"


class AsyncAgentRuns:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    async def policy(self, *, request_timeout: float | None = None) -> ObservabilityPolicy:
        return await self._transport.request(
            "GET",
            "/v1/observability/policy",
            ObservabilityPolicy,
            request_timeout=request_timeout,
        )

    async def create(
        self,
        name: str,
        sandbox_id: str,
        *,
        capture: Capture = "metadata",
        request_timeout: float | None = None,
    ) -> AgentRun:
        result = await self._transport.request(
            "POST",
            "/v1/agent-runs",
            AgentRunResponse,
            body={"name": name, "sandboxId": sandbox_id, "capture": capture},
            request_timeout=request_timeout,
        )
        return result.run

    async def list(
        self,
        filters: AgentRunFilter | None = None,
        *,
        request_timeout: float | None = None,
    ) -> AgentRunsResponse:
        return await self._transport.request(
            "GET",
            "/v1/agent-runs",
            AgentRunsResponse,
            params=(filters or AgentRunFilter()).model_dump(by_alias=True, exclude_none=True),
            request_timeout=request_timeout,
        )

    async def get(self, run_id: str, *, request_timeout: float | None = None) -> AgentRun:
        result = await self._transport.request(
            "GET",
            run_path(run_id),
            AgentRunResponse,
            request_timeout=request_timeout,
        )
        return result.run

    async def close(
        self,
        run_id: str,
        outcome: Outcome,
        *,
        request_timeout: float | None = None,
    ) -> AgentRun:
        result = await self._transport.request(
            "POST",
            f"{run_path(run_id)}/close",
            AgentRunResponse,
            body={"outcome": outcome},
            request_timeout=request_timeout,
        )
        return result.run

    async def spans(
        self,
        run_id: str,
        window: TelemetryRead,
        *,
        request_timeout: float | None = None,
    ) -> TelemetrySnapshot[TelemetrySpan]:
        return await self._transport.request(
            "GET",
            f"{run_path(run_id)}/spans",
            TelemetrySnapshot[TelemetrySpan],
            params=window.model_dump(by_alias=True, exclude_none=True),
            request_timeout=request_timeout,
        )

    async def logs(
        self,
        run_id: str,
        window: TelemetryRead,
        *,
        request_timeout: float | None = None,
    ) -> TelemetrySnapshot[TelemetryLog]:
        return await self._transport.request(
            "GET",
            f"{run_path(run_id)}/logs",
            TelemetrySnapshot[TelemetryLog],
            params=window.model_dump(by_alias=True, exclude_none=True),
            request_timeout=request_timeout,
        )

    async def grant(
        self,
        run_id: str,
        sandbox_id: str,
        *,
        request_timeout: float | None = None,
    ) -> TelemetryGrant:
        result = await self._transport.request(
            "POST",
            f"{run_path(run_id)}/grants",
            TelemetryGrant,
            body={"sandboxId": sandbox_id},
            request_timeout=request_timeout,
        )
        return result.for_api(self._transport.config.api_url)

    async def revoke_grant(
        self,
        run_id: str,
        grant_id: str,
        *,
        request_timeout: float | None = None,
    ) -> None:
        await self._transport.request(
            "DELETE",
            f"{run_path(run_id)}/grants/{segment(grant_id)}",
            Ok,
            request_timeout=request_timeout,
        )
