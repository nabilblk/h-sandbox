from __future__ import annotations

import asyncio
import time

import httpx
import pytest
from anyio.from_thread import start_blocking_portal
from harakiri._config import ClientConfig
from harakiri._transport import Transport
from harakiri.errors import AuthorizationError, ProtocolError, RequestTimeoutError
from harakiri.models import Ok


class SlowBody(httpx.AsyncByteStream):
    closed = False

    async def __aiter__(self):
        yield b'{"ok":'
        await asyncio.sleep(2)
        yield b"true}"

    async def aclose(self):
        self.closed = True


@pytest.mark.asyncio
async def test_total_body_deadline_and_borrowed_http_ownership():
    body = SlowBody()
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=body))
    ) as http:
        transport = Transport(ClientConfig("https://example.test", "private-key"), http)
        started = time.monotonic()
        with pytest.raises(RequestTimeoutError) as error:
            await transport.request("POST", "/v1/sandboxes", Ok, request_timeout=0.03)
        assert time.monotonic() - started < 0.5
        assert error.value.outcome_unknown
        assert body.closed
        await transport.close()
        assert not http.is_closed


def test_same_deadline_through_sync_portal():
    async def request():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=SlowBody()))
        ) as http:
            transport = Transport(ClientConfig("https://example.test", "private-key"), http)
            await transport.request("GET", "/v1/sandboxes", Ok, request_timeout=0.03)

    started = time.monotonic()
    with start_blocking_portal() as portal, pytest.raises(RequestTimeoutError):
        portal.call(request)
    assert time.monotonic() - started < 0.5


@pytest.mark.asyncio
async def test_redirect_is_not_followed_and_secret_is_not_in_error():
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(302, headers={"location": "https://foreign.test"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        transport = Transport(ClientConfig("https://example.test", "private-key"), http)
        from harakiri.errors import ApiError

        with pytest.raises(ApiError) as error:
            await transport.request("GET", "/v1/sandboxes", Ok)
        assert len(requests) == 1
        assert "private-key" not in repr(error.value)


@pytest.mark.asyncio
async def test_response_limits_and_untrusted_error_text():
    responses = iter(
        [
            httpx.Response(200, content=b"x" * 2048),
            httpx.Response(403, json={"error": "forbidden", "message": "private-key"}),
            httpx.Response(200, json={"ok": {"secret": "private-key"}}),
        ]
    )
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: next(responses))
    ) as http:
        transport = Transport(
            ClientConfig("https://example.test", "private-key", max_response_bytes=1024), http
        )
        for expected in (ProtocolError, AuthorizationError, ProtocolError):
            with pytest.raises(expected) as error:
                await transport.request("GET", "/v1/sandboxes", Ok)
            assert "private-key" not in str(error.value)


@pytest.mark.parametrize(
    "url",
    [
        "file:///tmp/x",
        "https://u:p@host",
        "https://host?q=x",
        "https://host#x",
        "https://host\nx",
        "https://host:bad",
    ],
)
def test_invalid_origins(url):
    with pytest.raises(ValueError):
        ClientConfig(url, "private-key")
