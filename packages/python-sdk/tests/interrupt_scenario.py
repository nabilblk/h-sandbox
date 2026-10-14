"""Isolated interruption fixture: mock HTTP only; signals target this process."""

from __future__ import annotations

import asyncio
import os
import signal
import sys
import threading
import time
from concurrent.futures import Future
from contextlib import nullcontext
from unittest.mock import patch

import httpx
from conftest import FakeAPI
from harakiri import AsyncSandbox, HarakiriClient
from harakiri.errors import CleanupError


def leaves(error):
    if isinstance(error, BaseExceptionGroup):
        return [leaf for child in error.exceptions for leaf in leaves(child)]
    return [error]


def main(scenario):
    api = FakeAPI()
    api.delete_error = scenario == "cleanup-failure"
    reached = threading.Event()
    cleaning = threading.Event()
    events = []
    before = {thread.ident for thread in threading.enumerate()}

    async def handler(request):
        if request.url.path.endswith("/readiness"):
            if scenario != "exit":
                reached.set()
                await asyncio.sleep(0.3)
        if request.method == "DELETE":
            events.append("delete-start")
            cleaning.set()
            if scenario == "exit":
                reached.set()
            await asyncio.sleep(0.2)
            events.append("delete-finished")
        return api(request)

    class OwnedHTTP(httpx.AsyncClient):
        def __init__(self, **kwargs):
            super().__init__(transport=httpx.MockTransport(handler), **kwargs)

        async def aclose(self):
            events.append("http-close")
            await super().aclose()

    def interrupt():
        assert reached.wait(3), "Test never reached the intended interruption point"
        time.sleep(0.05)
        os.kill(os.getpid(), signal.SIGINT)
        if scenario == "repeat-entry":
            assert cleaning.wait(3), "Interrupted entry did not start cleanup"
            time.sleep(0.05)
            os.kill(os.getpid(), signal.SIGINT)

    result = Future.result
    delivered = False

    def interrupt_delivery(future, *args, **kwargs):
        nonlocal delivered
        value = result(future, *args, **kwargs)
        if isinstance(value, AsyncSandbox) and not delivered:
            delivered = True
            raise KeyboardInterrupt("Interrupted after entry completed")
        return value

    signal.signal(signal.SIGINT, signal.default_int_handler)
    interrupter = None if scenario == "entry-completed" else threading.Thread(target=interrupt)
    with patch("harakiri._transport.httpx.AsyncClient", OwnedHTTP):
        try:
            with HarakiriClient(api_url="https://fixture.test", api_key="private") as client:
                # Start the portal before injecting the interruption under test.
                client.sandboxes.connect("sbx_test")
                if interrupter:
                    interrupter.start()
                with (
                    patch("concurrent.futures.Future.result", interrupt_delivery)
                    if scenario == "entry-completed"
                    else nullcontext()
                ):
                    with client.sandboxes.task(
                        template="fixture", readiness_timeout=2, cleanup_timeout=2
                    ):
                        assert scenario == "exit", "Interrupted entry reached the task body"
        except BaseException as error:
            failures = leaves(error)
            assert any(isinstance(failure, KeyboardInterrupt) for failure in failures), failures
            cleanup = [failure for failure in failures if isinstance(failure, CleanupError)]
            assert bool(cleanup) == api.delete_error
            if cleanup:
                assert cleanup[0].sandbox.id == "sbx_test"
                assert cleanup[0].__cause__ is not None
        else:
            raise AssertionError("Interruption was swallowed")
    if interrupter:
        interrupter.join(timeout=3)
        assert not interrupter.is_alive()
    assert events == ["delete-start", "delete-finished", "http-close"], events
    assert api.status == ("running" if api.delete_error else "terminated")
    assert api.capacity_phase == ("active" if api.delete_error else "released")
    assert not any("archive" in str(request.url) for request in api.requests)
    assert not {thread.ident for thread in threading.enumerate()} - before
    print("interruption and cleanup verified")


if __name__ == "__main__":
    main(sys.argv[1])
