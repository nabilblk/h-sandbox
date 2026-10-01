"""Installed-artifact consumer. Run only inside the guarded disposable harness."""

import asyncio
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

from harakiri import AsyncHarakiriClient, HarakiriClient
from harakiri.errors import ApiError, AuthorizationError, CapacityError, NotFoundError
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
        failure = {
            "gate": name,
            "type": type(error).__name__,
            "frames": frames[-4:],
            "observations": observations,
        }
        if isinstance(error, ApiError):
            failure.update(status=error.status, code=error.code)
        Path("native-failure.json").write_text(json.dumps(failure))
        raise
    results.append({"gate": name, "status": "passed"})
    Path("native-result.json").write_text(
        json.dumps(
            {
                "results": results,
                "observations": observations,
                "python": platform.python_version(),
                "packages": {
                    name: importlib.metadata.version(name)
                    for name in (
                        "h-sandbox",
                        "h-sandbox-deepagents",
                        "deepagents",
                        "httpx",
                        "anyio",
                        "pydantic",
                        "langchain",
                        "langchain-core",
                        "langgraph",
                        "langgraph-checkpoint",
                        "langgraph-checkpoint-sqlite",
                        "langchain-ollama",
                    )
                },
            }
        )
    )


def synchronous():
    with HarakiriClient.from_env() as client:
        assert client.templates.list()
        assert client.runtime.capabilities().provider
        assert client.capacity.get().in_use == 0
        with client.sandboxes.task(template=template, ttl_seconds=600) as sandbox:
            assert sandbox.readiness.status == "ready"
            gate("cross-organization-denial", lambda: cross_organization(sandbox.id))
            assert sandbox.run("printf hello", check=True).stdout.strip() == "hello"
            try:
                client.sandboxes.create(template=template)
            except CapacityError as error:
                assert error.code == "organization_capacity_exceeded"
            else:
                raise AssertionError("Organization capacity was not enforced")
            sandbox.files.write("text.txt", "hello\n")
            assert sandbox.files.read_text("text.txt") == "hello\n"
            payload = bytes(range(256)) * 4
            sandbox.files.write("bytes.bin", payload)
            assert sandbox.files.read_bytes("bytes.bin") == payload
            backend = HarakiriSandboxBackend(sandbox, timeout=15)
            assert backend.execute("printf native").output.strip() == "native"
            assert not backend.write("tool.txt", "first\nsecond\n").error
            read = backend.read("tool.txt")
            assert read.error is None and read.file_data["content"] == "first\nsecond"
            assert backend.grep("first", path=sandbox.workdir).matches
            assert not backend.edit("tool.txt", "first", "changed").error
            assert backend.glob("*.txt", path=sandbox.workdir).matches
            assert backend.ls(sandbox.workdir).entries
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
            read = await backend.aread("async.txt")
            assert read.error is None and read.file_data["content"] == "native async"
            assert (await backend.agrep("native", path=sandbox.workdir)).matches
            assert not (await backend.aedit("async.txt", "native", "verified")).error
            assert (await backend.aglob("*.txt", path=sandbox.workdir)).matches
            assert (await backend.als(sandbox.workdir)).entries
            assert (await backend.aexecute("printf async")).output.strip() == "async"
            await backend.adelete("async.txt")


def wait_available(client, workspace_id):
    deadline = time.monotonic() + 180
    while (remaining := deadline - time.monotonic()) > 0:
        workspace = client.workspaces.get(workspace_id, request_timeout=min(remaining, 30))
        if workspace.status == "available" and workspace.attached_sandbox_id is None:
            return
        time.sleep(min(0.5, max(0, deadline - time.monotonic())))
    raise TimeoutError("Workspace did not become available; no replacement was submitted")


def recovery():
    with HarakiriClient.from_env() as client:
        workspace = client.workspaces.create("python-recovery")
        with client.sandboxes.task(template=template, workspace_id=workspace.id) as sandbox:
            before = len(sandbox.processes.list())
            args = [sys.executable, "worker.py", "--database", "acknowledgement.sqlite"]
            subprocess.run([*args, "start", "--sandbox-id", sandbox.id], check=True, timeout=60)
            subprocess.run([*args, "observe"], check=True, timeout=90)
            assert len(sandbox.processes.list()) == before + 1
        wait_available(client, workspace.id)
        replacement = client.sandboxes.create(
            template=template, workspace_id=workspace.id, ttl_seconds=20
        )
        assert replacement.files.read_text("recovery-marker.txt") == "completed\n"
        # Let the platform expire this runtime, rather than claiming kill is a TTL test.
        replacement.wait_terminated(timeout=180)
        wait_available(client, workspace.id)
        with client.sandboxes.task(template=template, workspace_id=workspace.id) as restored:
            assert restored.id != replacement.id
            assert restored.files.read_text("recovery-marker.txt") == "completed\n"
        wait_available(client, workspace.id)
        client.workspaces.archive(workspace.id)


def scoped_key():
    with HarakiriClient(
        api_url=os.environ["HARAKIRI_API_URL"], api_key=os.environ["HARAKIRI_READ_ONLY_KEY"]
    ) as client:
        client.sandboxes.list()
        try:
            client.sandboxes.create(template=template)
        except AuthorizationError:
            pass
        else:
            raise AssertionError("Read-only key was allowed to create a runtime")


def cross_organization(sandbox_id):
    with HarakiriClient(
        api_url=os.environ["HARAKIRI_API_URL"], api_key=os.environ["HARAKIRI_FOREIGN_KEY"]
    ) as client:
        assert client.sandboxes.list() == []
        try:
            client.sandboxes.connect(sandbox_id)
        except NotFoundError:
            pass
        else:
            raise AssertionError("Foreign organization could access the sandbox")


def large_artifacts():
    with HarakiriClient.from_env() as client:
        with client.sandboxes.task(template=template) as sandbox:
            for size in (1024 * 1024, 16 * 1024 * 1024):
                payload = bytes(range(256)) * (size // 256)
                sandbox.files.write("large.bin", payload)
                assert sandbox.files.read_bytes("large.bin") == payload


def remote_deadline():
    with HarakiriClient.from_env() as client:
        with client.sandboxes.task(template=template) as sandbox:
            timed_out = HarakiriSandboxBackend(sandbox, timeout=15).execute("sleep 10", timeout=1)
            notice = any(
                text in timed_out.output
                for text in ("timed out", "killed", "runtime error", "unconfirmed")
            )
            reason = timed_out.finish_reason
            observations["remoteDeadline"] = {
                "exitCode": timed_out.exit_code,
                "finishReason": reason
                if reason in {"exit", "timeout", "error", "killed", "unknown", None}
                else "unrecognized",
                "frameworkVisibleNotice": notice,
            }
            assert timed_out.abnormal and notice


if __name__ == "__main__":
    assert os.environ.get("HARAKIRI_PYTHON_ACCEPTANCE") == "disposable-runner"
    template = os.environ["HARAKIRI_TEMPLATE"]
    results = []
    observations = {}
    if sys.argv[1:] == ["--large-artifacts"]:
        gate("native-1-and-16-mib-artifacts", large_artifacts)
        sys.exit(0)
    if sys.argv[1:] == ["--remote-deadline"]:
        gate("native-remote-deadline", remote_deadline)
        sys.exit(0)
    gate("scoped-key-denial", scoped_key)
    gate("sync-lifecycle-tools-files-cleanup", synchronous)
    gate("native-async-tools", lambda: asyncio.run(asynchronous()))
    gate("separate-worker-and-expired-runtime-file-recovery", recovery)
