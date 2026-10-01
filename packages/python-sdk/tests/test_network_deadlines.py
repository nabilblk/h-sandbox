"""Real sockets, ephemeral loopback ports, and only test-owned server threads."""

import asyncio
import socketserver
import threading
import time
from contextlib import contextmanager

import pytest
from harakiri import AsyncHarakiriClient, HarakiriClient
from harakiri.errors import RequestError, RequestTimeoutError


@contextmanager
def stalled_server(mode):
    entered = threading.Event()
    disconnected = threading.Event()

    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            self.request.settimeout(2)
            request = bytearray()
            while b"\r\n\r\n" not in request:
                chunk = self.request.recv(4096)
                if not chunk:
                    return
                request.extend(chunk)
            entered.set()
            if mode != "headers":
                self.request.sendall(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                    b'Content-Length: 16\r\n\r\n{"templates":'
                )
            if mode == "disconnect":
                return
            if self.request.recv(1) == b"":
                disconnected.set()

    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_address[1]}", entered, disconnected
        finally:
            server.shutdown()
            thread.join(timeout=3)
            assert not thread.is_alive()


@pytest.mark.parametrize("mode", ["headers", "body", "disconnect"])
def test_sync_network_deadline_releases_socket_and_portal(mode):
    with stalled_server(mode) as (url, entered, disconnected):
        started = time.monotonic()
        expected = RequestError if mode == "disconnect" else RequestTimeoutError
        with HarakiriClient(api_url=url, api_key="test-only", request_timeout=0.1) as client:
            with pytest.raises(expected):
                client.templates.list()
        assert entered.is_set()
        assert time.monotonic() - started < 1
        if mode != "disconnect":
            assert disconnected.wait(timeout=1)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["headers", "body", "disconnect", "cancel"])
async def test_async_network_deadline_and_cancel_release_socket(mode):
    with stalled_server(mode) as (url, entered, disconnected):
        async with AsyncHarakiriClient(
            api_url=url, api_key="test-only", request_timeout=0.1
        ) as client:
            task = asyncio.create_task(client.templates.list())
            assert await asyncio.to_thread(entered.wait, 1)
            if mode == "cancel":
                task.cancel()
            expected = {
                "headers": RequestTimeoutError,
                "body": RequestTimeoutError,
                "disconnect": RequestError,
                "cancel": asyncio.CancelledError,
            }[mode]
            with pytest.raises(expected):
                await task
        if mode != "disconnect":
            assert await asyncio.to_thread(disconnected.wait, 1)
