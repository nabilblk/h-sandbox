from __future__ import annotations

import asyncio
import json
import threading

import pytest
from harakiri import AsyncHarakiriClient, CommandReference, HarakiriClient
from harakiri.errors import CommandCallbackError, IntegrityError
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
