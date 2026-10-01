"""Installed-artifact consumer. Run only inside the guarded disposable harness."""

import asyncio
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

from harakiri import AsyncHarakiriClient, HarakiriClient
from harakiri_deepagents import AsyncHarakiriSandboxBackend, HarakiriSandboxBackend


def gate(name, action):
    try:
        action()
    except BaseException as error:
        frames = []
        traceback = error.__traceback__
        while traceback:
            frame = traceback.tb_frame
            frames.append({"function": frame.f_code.co_name, "line": traceback.tb_lineno})
            traceback = traceback.tb_next
        Path("native-failure.json").write_text(
            json.dumps({"gate": name, "type": type(error).__name__, "frames": frames[-4:]})
        )
        raise
    results.append({"gate": name, "status": "passed"})


def synchronous():
    with HarakiriClient.from_env() as client:
        assert client.templates.list()
        assert client.runtime.capabilities().provider
        assert client.capacity.get().in_use == 0
        with client.sandboxes.task(template=template, ttl_seconds=600) as sandbox:
            assert sandbox.readiness.status == "ready"
            assert sandbox.run("printf hello", check=True).stdout == "hello"
            sandbox.files.write("text.txt", "hello\n")
            assert sandbox.files.read_text("text.txt") == "hello\n"
            payload = bytes(range(256)) * 4096
            sandbox.files.write("bytes.bin", payload)
            assert sandbox.files.read_bytes("bytes.bin") == payload
            backend = HarakiriSandboxBackend(sandbox, timeout=15)
            assert backend.execute("printf native").output == "native"
            assert not backend.write("tool.txt", "first\nsecond\n").error
            assert "first" in "\n".join(backend.read("tool.txt").file_data["content"])
            assert backend.grep("first", path=sandbox.workdir).matches
            assert not backend.edit("tool.txt", "first", "changed").error
            assert backend.glob("*.txt", path=sandbox.workdir).matches
            assert backend.ls(sandbox.workdir).entries
            timed_out = backend.execute("sleep 10", timeout=1)
            assert timed_out.abnormal and "did not complete" in timed_out.output
            clipped = HarakiriSandboxBackend(sandbox, max_output_bytes=32).execute(
                "python3 -c 'print(\"x\" * 1000)'"
            )
            assert clipped.truncated
            with HarakiriClient.from_env() as borrowed:
                assert borrowed.sandboxes.connect(sandbox.id).id == sandbox.id
            assert sandbox.refresh().status in {"running", "idle"}
        assert sandbox.refresh().capacity_phase == "released"


async def asynchronous():
    async with AsyncHarakiriClient.from_env() as client:
        async with client.sandboxes.task(template=template) as sandbox:
            backend = AsyncHarakiriSandboxBackend(sandbox, timeout=15)
            await backend.awrite("async.txt", "native async\n")
            assert "native async" in "\n".join((await backend.aread("async.txt")).file_data["content"])
            assert (await backend.agrep("native", path=sandbox.workdir)).matches
            assert not (await backend.aedit("async.txt", "native", "verified")).error
            assert (await backend.aglob("*.txt", path=sandbox.workdir)).matches
            assert (await backend.als(sandbox.workdir)).entries
            assert (await backend.aexecute("printf async")).output == "async"
            await backend.adelete("async.txt")


def recovery():
    with HarakiriClient.from_env() as client:
        workspace = client.workspaces.create("python-recovery")
        with client.sandboxes.task(template=template, workspace_id=workspace.id) as sandbox:
            before = len(sandbox.processes.list())
            args = [sys.executable, "worker.py", "--database", "acknowledgement.sqlite"]
            subprocess.run([*args, "start", "--sandbox-id", sandbox.id], check=True, timeout=60)
            subprocess.run([*args, "observe"], check=True, timeout=90)
            assert len(sandbox.processes.list()) == before + 1
        assert client.workspaces.get(workspace.id).attached_sandbox_id is None
        replacement = client.sandboxes.create(
            template=template, workspace_id=workspace.id, ttl_seconds=20
        )
        assert replacement.files.read_text("recovery-marker.txt") == "completed\n"
        # Let the platform expire this runtime, rather than claiming kill is a TTL test.
        replacement.wait_terminated(timeout=180)
        with client.sandboxes.task(template=template, workspace_id=workspace.id) as restored:
            assert restored.id != replacement.id
            assert restored.files.read_text("recovery-marker.txt") == "completed\n"
        client.workspaces.archive(workspace.id)


if __name__ == "__main__":
    assert os.environ.get("HARAKIRI_PYTHON_ACCEPTANCE") == "disposable-runner"
    template = os.environ["HARAKIRI_TEMPLATE"]
    results = []
    gate("sync-lifecycle-tools-files-cleanup", synchronous)
    gate("native-async-tools", lambda: asyncio.run(asynchronous()))
    gate("separate-worker-and-expired-runtime-file-recovery", recovery)
    Path("native-result.json").write_text(
        json.dumps(
            {
                "results": results,
                "python": platform.python_version(),
                "packages": {
                    name: importlib.metadata.version(name)
                    for name in ("h-sandbox", "h-sandbox-deepagents", "deepagents", "httpx")
                },
            }
        )
    )
