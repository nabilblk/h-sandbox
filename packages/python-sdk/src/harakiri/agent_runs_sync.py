"""Synchronous run facade over the same bounded async transport."""

from __future__ import annotations

from ._sync import Bridge
from .agent_runs import AsyncAgentRuns
from .telemetry_models import (
    AgentRun,
    AgentRunFilter,
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


class AgentRuns:
    def __init__(self, bridge: Bridge, resource: AsyncAgentRuns) -> None:
        self._bridge, self._resource = bridge, resource

    def policy(self, *, request_timeout: float | None = None) -> ObservabilityPolicy:
        return self._bridge.call(self._resource.policy, request_timeout=request_timeout)

    def create(
        self,
        name: str,
        sandbox_id: str,
        *,
        capture: Capture = "metadata",
        request_timeout: float | None = None,
    ) -> AgentRun:
        return self._bridge.call(
            self._resource.create,
            name,
            sandbox_id,
            capture=capture,
            request_timeout=request_timeout,
        )

    def list(
        self,
        filters: AgentRunFilter | None = None,
        *,
        request_timeout: float | None = None,
    ) -> AgentRunsResponse:
        return self._bridge.call(self._resource.list, filters, request_timeout=request_timeout)

    def get(self, run_id: str, *, request_timeout: float | None = None) -> AgentRun:
        return self._bridge.call(self._resource.get, run_id, request_timeout=request_timeout)

    def close(
        self,
        run_id: str,
        outcome: Outcome,
        *,
        request_timeout: float | None = None,
    ) -> AgentRun:
        return self._bridge.call(
            self._resource.close,
            run_id,
            outcome,
            request_timeout=request_timeout,
        )

    def spans(
        self,
        run_id: str,
        window: TelemetryRead,
        *,
        request_timeout: float | None = None,
    ) -> TelemetrySnapshot[TelemetrySpan]:
        return self._bridge.call(
            self._resource.spans,
            run_id,
            window,
            request_timeout=request_timeout,
        )

    def logs(
        self,
        run_id: str,
        window: TelemetryRead,
        *,
        request_timeout: float | None = None,
    ) -> TelemetrySnapshot[TelemetryLog]:
        return self._bridge.call(
            self._resource.logs,
            run_id,
            window,
            request_timeout=request_timeout,
        )

    def grant(
        self,
        run_id: str,
        sandbox_id: str,
        *,
        request_timeout: float | None = None,
    ) -> TelemetryGrant:
        return self._bridge.call(
            self._resource.grant,
            run_id,
            sandbox_id,
            request_timeout=request_timeout,
        )

    def revoke_grant(
        self,
        run_id: str,
        grant_id: str,
        *,
        request_timeout: float | None = None,
    ) -> None:
        self._bridge.call(
            self._resource.revoke_grant,
            run_id,
            grant_id,
            request_timeout=request_timeout,
        )
