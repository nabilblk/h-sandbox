from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from harakiri import (
    AgentRunFilter,
    AsyncHarakiriClient,
    HarakiriClient,
    TelemetryGrant,
    TelemetryRead,
)
from harakiri.errors import ApiError

RUN = {
    "id": "run_test",
    "name": "Repair",
    "capture": "metadata",
    "reportedOutcome": "unknown",
    "sandboxIds": ["sbx_test"],
    "createdAt": "2026-11-09T12:00:00Z",
    "closedAt": None,
    "retainedUntil": "2026-11-16T12:00:00Z",
    "expired": False,
    "recording": True,
    "lastAcceptedAt": None,
    "lastRejectedAt": None,
    "lastRejection": None,
}


def grant():
    return {
        "id": "grant_test",
        "token": "htg_private",
        "capture": "metadata",
        "expiresAt": (datetime.now(UTC) + timedelta(minutes=15)).isoformat(),
    }


@pytest.mark.asyncio
async def test_control_reads_and_grants_preserve_wire_contract_and_secret_boundary():
    calls = []

    def handle(request):
        calls.append(request)
        assert request.headers["x-api-key"] == "private-platform-key"
        if request.url.path.endswith("/grants"):
            return httpx.Response(201, json=grant())
        if request.method == "DELETE":
            return httpx.Response(200, json={"ok": True})
        if request.url.path.endswith("/logs"):
            return httpx.Response(
                200,
                json={
                    "records": [],
                    "window": {"from": "2026-11-09T12:00:00Z", "to": "2026-11-09T13:00:00Z"},
                    "readAt": "2026-11-09T13:00:00Z",
                    "consistency": "eventual",
                    "scannedRecords": 0,
                    "rejectedRecords": 0,
                    "issues": ["record_limit"],
                    "partial": True,
                },
            )
        if request.method == "GET" and request.url.path == "/v1/agent-runs":
            return httpx.Response(200, json={"runs": [RUN], "nextCursor": None})
        return httpx.Response(200, json={"run": RUN})

    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http,
        AsyncHarakiriClient(
            api_url="https://api.test", api_key="private-platform-key", http_client=http
        ) as client,
    ):
        run = await client.agent_runs.create("Repair", "sbx_test")
        assert run.reported_outcome == "unknown"
        assert json.loads(calls[-1].content)["capture"] == "metadata"
        page = await client.agent_runs.list(AgentRunFilter(search="a&b", limit=1))
        assert page.runs[0].id == run.id
        assert calls[-1].url.params["search"] == "a&b"
        assert (await client.agent_runs.get(run.id)).id == run.id
        scoped = await client.agent_runs.grant(run.id, "sbx_test")
        assert "htg_private" not in repr(scoped)
        assert "htg_private" not in scoped.model_dump_json()
        options = scoped.exporter_options("traces")
        assert options.endpoint == "https://api.test/v1/telemetry/traces"
        assert options.headers == {"Authorization": "Bearer htg_private"}
        assert "htg_private" not in repr(options)
        result = await client.agent_runs.logs(
            run.id,
            TelemetryRead(
                from_time="2026-11-09T12:00:00Z",
                to_time="2026-11-09T13:00:00Z",
            ),
        )
        assert result.partial and result.issues == ["record_limit"]
        assert calls[-1].url.params["includeContent"] == "false"
        await client.agent_runs.close(run.id, "unknown")
        await client.agent_runs.revoke_grant(run.id, scoped.id)


def test_synchronous_client_uses_same_run_resource_and_does_not_own_the_sandbox():
    calls = []

    def handle(request):
        calls.append(request)
        assert request.url.path.startswith("/v1/agent-runs")
        return httpx.Response(200, json={"run": RUN})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    with HarakiriClient(api_url="https://api.test", api_key="test", http_client=http) as client:
        assert client.agent_runs.create("Repair", "sbx_test").id == "run_test"
        assert client.agent_runs.close("run_test", "unknown").id == "run_test"
    assert len(calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [403, 404, 410, 429, 503])
async def test_read_errors_remain_typed(status):
    async with (
        httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    status,
                    json={"error": "telemetry_unavailable"},
                )
            )
        ) as http,
        AsyncHarakiriClient(api_url="https://api.test", api_key="test", http_client=http) as client,
    ):
        with pytest.raises(ApiError) as error:
            await client.agent_runs.get("run_test")
        assert error.value.status == status


def test_grant_options_reject_expiry_and_credential_urls():
    scoped = TelemetryGrant.model_validate(grant())
    for url in ["https://user:password@api.test", "https://api.test/?secret=x", "file:///tmp/otel"]:
        with pytest.raises(ValueError):
            scoped.for_api(url)
    expired = TelemetryGrant.model_validate({**grant(), "expiresAt": "2020-01-01T00:00:00Z"})
    with pytest.raises(ValueError, match="expired"):
        expired.for_api("https://api.test").exporter_options("logs")
