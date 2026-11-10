"""Installed-wheel/sdist contract smoke with no backend or tracing dependency."""

import sys
from datetime import UTC, datetime, timedelta

import httpx
from harakiri import HarakiriClient, TelemetryGrant, TelemetryRead

assert "opentelemetry.sdk" not in sys.modules
requests = []


def respond(request: httpx.Request) -> httpx.Response:
    requests.append(request)
    assert request.headers["x-api-key"] == "private-platform-key"
    if request.url.path.endswith("/grants"):
        return httpx.Response(
            201,
            json={
                "id": "grant_test",
                "token": "htg_private",
                "capture": "metadata",
                "expiresAt": (datetime.now(UTC) + timedelta(minutes=15)).isoformat(),
            },
        )
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


http = httpx.AsyncClient(transport=httpx.MockTransport(respond))
with HarakiriClient(
    api_url="https://fixture.invalid", api_key="private-platform-key", http_client=http
) as client:
    grant = client.agent_runs.grant("run_test", "sbx_test")
    assert isinstance(grant, TelemetryGrant)
    assert "htg_private" not in repr(grant)
    assert "htg_private" not in grant.model_dump_json()
    assert grant.exporter_options("traces").headers == {"Authorization": "Bearer htg_private"}
    result = client.agent_runs.spans(
        "run_test",
        TelemetryRead(
            from_time="2026-11-09T12:00:00Z",
            to_time="2026-11-09T13:00:00Z",
        ),
    )
    assert result.partial
    assert requests[-1].url.params["includeContent"] == "false"
print("Installed Python SDK: typed runs, bounded reads and private exporter grants passed.")
