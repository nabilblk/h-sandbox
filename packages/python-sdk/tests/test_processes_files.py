from __future__ import annotations

import asyncio
import json
import threading

import httpx
import pytest
from harakiri import AsyncHarakiriClient, CommandReference, HarakiriClient
from harakiri.errors import CommandCallbackError, IntegrityError, ProtocolError
from harakiri.files import decode_artifact
from harakiri.models import DownloadResponse


def test_acknowledgement_callback_on_caller_thread_and_read_only_recovery(api, http):
    owner = threading.get_ident()
    saved = []

    def persist(reference):
        assert threading.get_ident() == owner
        saved.append(reference.model_dump_json())

    with HarakiriClient(
        api_url="https://fixture.test", api_key="private", http_client=http
    ) as client:
        sandbox = client.sandboxes.connect("sbx_test")
        process = sandbox.processes.start("printf done", on_started=persist, timeout=2)
        assert process.id == "cmd_test"
        assert json.loads(api.requests[-1].content)["timeoutMs"] == 2000
        reference = CommandReference.model_validate_json(saved[0])
        reconnected = sandbox.processes.connect(reference.command_id)
        assert reconnected.observe().logs.stdout == "done\n"
        assert len([request for request in api.requests if request.method == "POST"]) == 1
    asyncio.run(http.aclose())


def test_failed_callback_preserves_reference(api, http):
    def broken(reference):
        raise OSError("database unavailable")

    with HarakiriClient(
        api_url="https://fixture.test", api_key="private", http_client=http
    ) as client:
        sandbox = client.sandboxes.connect("sbx_test")
        with pytest.raises(CommandCallbackError) as error:
            sandbox.processes.start("echo done", on_started=broken)
        assert error.value.reference.command_id == "cmd_test"
        assert isinstance(error.value.__cause__, OSError)
    asyncio.run(http.aclose())


@pytest.mark.asyncio
async def test_command_cancellation_is_not_remote_kill(api, http):
    api.command_status = "running"
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_test")
        process = await sandbox.processes.start("long work")
        task = asyncio.create_task(process.observe())
        await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert process.reference.command_id == "cmd_test"
        assert not any(request.method == "DELETE" for request in api.requests)


@pytest.mark.asyncio
async def test_concurrent_observers_share_acknowledged_identity_without_replay(api, http):
    api.command_status = "running"
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_test")
        process = await sandbox.processes.start("long work")
        async with asyncio.TaskGroup() as observers:
            first = observers.create_task(process.observe(timeout=1, poll_interval=0.005))
            second = observers.create_task(process.observe(timeout=1, poll_interval=0.005))
            await asyncio.sleep(0.02)
            api.command_status = "succeeded"
        for observed in (first.result(), second.result()):
            assert observed.command.reference == process.reference
            assert observed.logs.stdout == "done\n"
        assert len([request for request in api.requests if request.method == "POST"]) == 1
        assert not any(request.method == "DELETE" for request in api.requests)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "field"), [("logs", "commandId"), ("kill", "id"), ("kill", "sandboxId")]
)
async def test_mismatched_command_response_preserves_reference(api, operation, field):
    def handler(request):
        response = api(request)
        if request.url.path.endswith("/logs") or request.method == "DELETE":
            payload = response.json()
            target = payload if operation == "logs" else payload["command"]
            target[field] = "unrelated"
            return httpx.Response(200, json=payload)
        return response

    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_test")
        process = await sandbox.processes.connect("cmd_test")
        reference = process.reference
        with pytest.raises(ProtocolError):
            await getattr(process, operation)()
        assert process.reference == reference


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["cursor", "tail"])
@pytest.mark.parametrize("value", [-1, 1.5, True])
async def test_log_pagination_requires_nonnegative_integers(api, http, name, value):
    async with (
        http,
        AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="private", http_client=http
        ) as client,
    ):
        sandbox = await client.sandboxes.connect("sbx_test")
        process = await sandbox.processes.connect("cmd_test")
        count = len(api.requests)
        with pytest.raises(ValueError, match="nonnegative integer"):
            await process.logs(**{name: value})
        assert len(api.requests) == count


def test_corrupt_artifacts_and_limits(api):
    content = b"binary\0\xff"
    import base64

    wire = {
        "path": "/workspace/data",
        "contentBase64": base64.b64encode(content).decode(),
        **api.metadata(content),
    }
    assert decode_artifact(DownloadResponse.model_validate(wire), 1024) == content
    for change in ({"sha256": "sha256:bad"}, {"sizeBytes": 999}, {"contentBase64": "!?"}):
        with pytest.raises(IntegrityError):
            decode_artifact(DownloadResponse.model_validate({**wire, **change}), 1024)
    with pytest.raises(IntegrityError):
        decode_artifact(DownloadResponse.model_validate(wire), 2)
