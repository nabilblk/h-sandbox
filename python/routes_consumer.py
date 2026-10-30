"""Run only against an installed candidate wheel/sdist, with synthetic endpoints."""

import asyncio

import httpx
from harakiri import AsyncHarakiriClient, HarakiriClient, RouteResponse

grant = RouteResponse.model_validate(
    {
        "route": {
            "port": 8000,
            "protocol": "http",
            "accessMode": "token",
            "routeKey": "service",
            "url": "https://synthetic.invalid/v1/route-proxy/service/",
            "accessHeaderName": "x-harakiri-route-token",
            "state": "ready",
        },
        "accessToken": "fixture-grant",
    }
)


def respond(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/v1/sandboxes/sbx_fixture":
        return httpx.Response(
            200,
            json={
                "sandbox": {
                    "id": "sbx_fixture",
                    "name": "fixture",
                    "template": "test",
                    "status": "running",
                    "ttlSeconds": 300,
                    "expiresAt": "2026-10-29T12:05:00Z",
                    "createdAt": "2026-10-29T12:00:00Z",
                    "runtimeMetadata": {
                        "workdir": "/workspace",
                        "shell": "bash",
                        "user": "sandbox",
                        "limits": {"fileArtifactMaxBytes": 16777216, "commandTimeoutMs": 60000},
                    },
                }
            },
        )
    assert "x-api-key" not in request.headers
    assert request.headers["x-harakiri-route-token"] == "fixture-grant"
    return httpx.Response(200, json={"total": 24})


async def async_consumer() -> None:
    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http,
        AsyncHarakiriClient(
            api_url="https://synthetic.invalid",
            api_key="fixture-platform-key",
            http_client=http,
            service_http_client=http,
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_fixture")
        route = sandbox.routes.connect(grant)
        assert (await route.request(path="/report.json")).json() == {"total": 24}
        assert route.connection("/events", websocket=True).url.startswith("wss://")
        assert "fixture-grant" not in repr(route.grant)


def sync_consumer() -> None:
    http = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        with HarakiriClient(
            api_url="https://synthetic.invalid",
            api_key="fixture-platform-key",
            http_client=http,
            service_http_client=http,
        ) as client:
            route = client.sandboxes.connect("sbx_fixture").routes.connect(grant)
            assert route.wait_for_http().json() == {"total": 24}
    finally:
        asyncio.run(http.aclose())


asyncio.run(async_consumer())
sync_consumer()
print("Installed Python protected-service consumers: passed")
