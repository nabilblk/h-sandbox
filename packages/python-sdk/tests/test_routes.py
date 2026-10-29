from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from harakiri import AsyncHarakiriClient, HarakiriClient, RouteResponse
from harakiri.errors import ProtocolError


def grant(token="route-secret"):
    return {
        "route": {
            "port": 8000,
            "protocol": "http",
            "accessMode": "token",
            "routeKey": "service",
            "url": "https://api.test/v1/route-proxy/service/",
            "state": "ready",
            "accessHeaderName": "x-harakiri-route-token",
        },
        "accessToken": token,
        "accessHeaderName": "x-harakiri-route-token",
    }


@pytest.mark.asyncio
async def test_route_crud_and_application_auth_do_not_inherit_platform_auth(api):
    calls = []

    def control(request):
        calls.append(request)
        assert request.headers["x-api-key"] == "platform-secret"
        if request.url.path.endswith("/routes"):
            if request.method == "GET":
                return httpx.Response(200, json={"routes": [grant()["route"]]})
            assert json.loads(request.content)["accessMode"] == "token"
            return httpx.Response(201, json=grant())
        if request.method == "DELETE":
            return httpx.Response(200, json={"route": grant()["route"]})
        return api(request)

    def service(request):
        calls.append(request)
        assert request.headers["x-harakiri-route-token"] == "route-secret"
        assert request.headers["authorization"] == "Bearer application-key"
        assert "x-api-key" not in request.headers
        assert "cookie" not in request.headers
        assert request.url.path == "/v1/route-proxy/service/health"
        return httpx.Response(200, json={"ok": True}, headers={"set-cookie": "unsafe=1"})

    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(control)) as http,
        httpx.AsyncClient(
            transport=httpx.MockTransport(service),
            auth=("leak", "secret"),
            headers={"x-api-key": "must-not-inherit"},
            cookies={"session": "secret"},
        ) as services,
        AsyncHarakiriClient(
            api_url="https://api.test",
            api_key="platform-secret",
            http_client=http,
            service_http_client=services,
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_test")
        route = await sandbox.routes.expose(8000)
        assert route.url.endswith("/service/")
        assert len(await sandbox.routes.list()) == 1
        response = await route.wait_for_http(
            "/health", headers={"authorization": "Bearer application-key"}
        )
        assert response.json() == {"ok": True}
        # The service cookie jar must not contaminate the control-plane session.
        assert not http.cookies
        assert (await route.delete()).port == 8000
        restored = sandbox.routes.connect(RouteResponse.model_validate(grant()))
        assert restored.connection().headers["x-harakiri-route-token"] == "route-secret"
        assert "route-secret" not in repr(restored.grant)
        assert "route-secret" not in repr(restored.connection())


@pytest.mark.asyncio
async def test_service_scope_and_websocket_credentials(api, http):
    async with AsyncHarakiriClient(
        api_url="https://api.test", api_key="key", http_client=http
    ) as client:
        sandbox = await client.sandboxes.connect("sbx_test")
        route = sandbox.routes.connect(RouteResponse.model_validate(grant()))
        for path in [
            "//evil.test/",
            "../other",
            "%2e%2e/other",
            "x%2fother",
            "x%252fother",
            "x%0aother",
            "x%7fother",
            "a\\b",
            "https://api.test/v1/other",
        ]:
            with pytest.raises(ValueError):
                route.connection(path)
        ws = route.connection("/api/terminals/abc", websocket=True)
        assert ws.url == "wss://api.test/v1/route-proxy/service/api/terminals/abc"
        assert "secret" not in ws.url
        assert ws.headers == {"x-harakiri-route-token": "route-secret"}
        with pytest.raises(ValueError, match="one-time"):
            sandbox.routes.connect(RouteResponse.model_validate(grant(None))).connection()
        foreign = grant()
        foreign["sandboxId"] = "other"
        with pytest.raises(ProtocolError):
            sandbox.routes.connect(RouteResponse.model_validate(foreign))


@pytest.mark.asyncio
async def test_bounded_service_responses_and_redirects(api, http):
    responses = [
        httpx.Response(302, headers={"location": "https://must-not-contact.test"}),
        httpx.Response(200, content=b"x" * 1025),
    ]
    async with (
        httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: responses.pop(0))
        ) as services,
        AsyncHarakiriClient(
            api_url="https://api.test",
            api_key="key",
            http_client=http,
            service_http_client=services,
            max_response_bytes=1024,
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_test")
        route = sandbox.routes.connect(RouteResponse.model_validate(grant()))
        assert (await route.request()).status_code == 302
        with pytest.raises(ProtocolError, match="byte limit"):
            await route.request()
        assert not responses


def test_synchronous_routes_share_client_bridge(api):
    async def service(request):
        return httpx.Response(200, text="ok")

    http = httpx.AsyncClient(transport=httpx.MockTransport(api))
    services = httpx.AsyncClient(transport=httpx.MockTransport(service))
    with HarakiriClient(
        api_url="https://api.test",
        api_key="key",
        http_client=http,
        service_http_client=services,
    ) as client:
        sandbox = client.sandboxes.connect("sbx_test")
        route = sandbox.routes.connect(RouteResponse.model_validate(grant()))
        assert route.request().text == "ok"
        assert route.wait_for_http().status_code == 200
    asyncio.run(http.aclose())
    asyncio.run(services.aclose())


@pytest.mark.asyncio
async def test_cancelled_service_response_closes_stream_and_preserves_client(http):
    entered = asyncio.Event()

    class PendingBody(httpx.AsyncByteStream):
        closed = False

        async def __aiter__(self):
            yield b"partial"
            entered.set()
            await asyncio.Future()

        async def aclose(self):
            self.closed = True

    body = PendingBody()
    responses = [httpx.Response(200, stream=body), httpx.Response(200, text="next")]
    async with (
        httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: responses.pop(0))
        ) as services,
        AsyncHarakiriClient(
            api_url="https://api.test",
            api_key="key",
            http_client=http,
            service_http_client=services,
        ) as client,
    ):
        route = (await client.sandboxes.connect("sbx_test")).routes.connect(
            RouteResponse.model_validate(grant())
        )
        pending = asyncio.create_task(route.request())
        await asyncio.wait_for(entered.wait(), timeout=1)
        pending.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pending
        assert body.closed
        assert (await route.request()).text == "next"


@pytest.mark.asyncio
async def test_service_readiness_retries_not_ready_but_never_denied_access(http):
    responses = [httpx.Response(503), httpx.Response(401)]
    async with (
        httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: responses.pop(0))
        ) as services,
        AsyncHarakiriClient(
            api_url="https://api.test",
            api_key="key",
            http_client=http,
            service_http_client=services,
        ) as client,
    ):
        route = (await client.sandboxes.connect("sbx_test")).routes.connect(
            RouteResponse.model_validate(grant())
        )
        with pytest.raises(httpx.HTTPStatusError) as error:
            await route.wait_for_http(timeout=1, poll_interval=0.001)
        assert error.value.response.status_code == 401
        assert not responses
