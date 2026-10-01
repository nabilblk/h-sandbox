from __future__ import annotations

import asyncio
import json
import threading

import httpx
import pytest
from harakiri import AsyncHarakiriClient, HarakiriClient
from harakiri.errors import (
    CleanupError,
    ObservationTimeoutError,
    OperationCancelledError,
    RequestError,
    SandboxCreationError,
)


def test_owned_sync_workflow_and_retained_workspace(api, http):
    before = {thread.ident for thread in threading.enumerate()}
    with HarakiriClient(
        api_url="https://fixture.test", api_key="private", http_client=http
    ) as client:
        with client.sandboxes.task(template="fixture", workspace_id="ws_retained") as sandbox:
            assert sandbox.run("printf hello", check=True).stdout == "hello\n"
            sandbox.files.write("hello.txt", "hello")
            assert sandbox.files.read_text("hello.txt") == "hello"
            sandbox.files.write("hello.bin", b"\0\xff")
            assert sandbox.files.read_bytes("hello.bin") == b"\0\xff"
            assert sandbox.creation.status == "pending"
    assert api.status == "terminated"
    assert api.capacity_phase == "released"
    assert api.files["/workspace/hello.txt"] == b"hello"
    assert not any("archive" in str(request.url) for request in api.requests)
    assert not {thread.ident for thread in threading.enumerate()} - before
    assert not http.is_closed
    asyncio.run(http.aclose())


def test_borrowed_handle_survives_client_close(api, http):
    with HarakiriClient(
        api_url="https://fixture.test", api_key="private", http_client=http
    ) as client:
        sandbox = client.sandboxes.connect("sbx_test")
        assert sandbox.id == "sbx_test"
    assert [request.method for request in api.requests] == ["GET"]
    assert api.status == "running"
    asyncio.run(http.aclose())


@pytest.mark.asyncio
async def test_async_owned_cleanup_after_cancellation(api, http):
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):

        async def task():
            async with client.sandboxes.task(template="fixture"):
                raise asyncio.CancelledError("caller left")

        with pytest.raises(asyncio.CancelledError):
            await task()
        assert api.status == "terminated"


@pytest.mark.asyncio
async def test_cleanup_failure_keeps_primary_and_handle(api, http):
    api.delete_error = True
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        with pytest.raises(ExceptionGroup) as failure:
            async with client.sandboxes.task(template="fixture"):
                raise ValueError("application error")
        assert isinstance(failure.value.exceptions[0], ValueError)
        cleanup = failure.value.exceptions[1]
        assert isinstance(cleanup, CleanupError)
        assert cleanup.sandbox.id == "sbx_test"


@pytest.mark.asyncio
async def test_readiness_failure_cleanup_vs_application_ownership(api, http):
    api.ready = "starting"
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        with pytest.raises(SandboxCreationError) as error:
            await client.sandboxes.create(template="fixture", readiness_timeout=0.01)
        assert error.value.sandbox.id == "sbx_test"
        assert api.status == "running"
        with pytest.raises(ObservationTimeoutError):
            async with client.sandboxes.task(template="fixture", readiness_timeout=0.01):
                pytest.fail("not ready")
        assert api.status == "terminated"


@pytest.mark.asyncio
async def test_owned_task_rejects_replay_key_before_io(api, http):
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        with pytest.raises(TypeError):
            client.sandboxes.task(template="fixture", idempotency_key="old-creation")
        assert not api.requests


@pytest.mark.asyncio
async def test_terminated_without_release_is_not_cleanup_confirmation(api, http):
    api.status, api.capacity_phase = "terminated", "uncertain"
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_test")
        with pytest.raises(ObservationTimeoutError):
            await sandbox.wait_terminated(timeout=0.01)


@pytest.mark.asyncio
async def test_unknown_submission_retains_intent_without_retry():
    requests = []

    def fail(request):
        requests.append(request)
        raise httpx.ReadError("connection lost")

    async with httpx.AsyncClient(transport=httpx.MockTransport(fail)) as http:
        async with AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client:
            with pytest.raises(RequestError) as error:
                await client.sandboxes.create(template="fixture", wait=False)
            assert error.value.outcome_unknown
            assert error.value.idempotency_key == json.loads(requests[0].content)["idempotencyKey"]
            assert len(requests) == 1


@pytest.mark.asyncio
async def test_sync_call_inside_event_loop_fails_without_io(api, http):
    client = HarakiriClient(api_url="https://fixture.test", api_key="private", http_client=http)
    with pytest.raises(RuntimeError, match="AsyncHarakiriClient"):
        client.sandboxes.connect("sbx_test")
    assert not api.requests
    await asyncio.to_thread(client.close)
    await http.aclose()


@pytest.mark.asyncio
async def test_cancelled_readiness_keeps_accepted_sandbox(api, http):
    api.ready = "starting"
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        pending = asyncio.create_task(client.sandboxes.create(template="fixture"))
        while not any(str(request.url).endswith("/readiness") for request in api.requests):  # noqa: ASYNC110
            await asyncio.sleep(0)
        pending.cancel()
        with pytest.raises(OperationCancelledError) as error:
            await pending
        assert error.value.sandbox.id == "sbx_test"
        assert error.value.idempotency_key
        assert api.status == "running"
