"""Execute unmodified public downloads with real tools and a scripted model endpoint."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from harakiri import HarakiriClient

MODEL = "harakiri-doc-fixture"
GREETING = "Hello from Deep Agents"
SCRIPT = f"printf '{GREETING}\\n'\n"


class ScriptedConversation:
    """Only inference is simulated; tool results must come back from the real graph."""

    def __init__(self, *, workdir: str, existing: bool = False, virtual_paths: bool = False) -> None:
        self.workdir = workdir
        self.file_path = "/hello.sh" if virtual_paths else f"{workdir}/hello.sh"
        self.existing = existing
        self.responses = 0
        self.completed = False
        self.failure: str | None = None

    def respond(self, request: dict) -> dict:
        assert request["model"] == MODEL
        assert not self.completed, "Unexpected model invocation after completion"
        tools = {tool["function"]["name"] for tool in request["tools"]}
        outputs = [
            message["content"] for message in request["messages"] if message["role"] == "tool"
        ]
        assert len(outputs) == self.responses, "Tool result missing or execution retried"
        message: dict = {"role": "assistant", "content": ""}
        if self.responses == 0 and not self.existing:
            name = "write_file"
            arguments = {"file_path": self.file_path, "content": SCRIPT}
        elif self.responses == (0 if self.existing else 1):
            if not self.existing:
                assert outputs[-1] == f"Updated file {self.file_path}"
            name = "execute"
            arguments = {"command": "pwd" if self.existing else "bash hello.sh"}
        else:
            expected = self.workdir if self.existing else GREETING
            assert expected in outputs[-1], "Expected tool output was not observed"
            assert "[Command succeeded with exit code 0]" in outputs[-1]
            message["content"] = expected
            self.completed = True
            name = None
        if name is not None:
            assert name in tools, "Documented backend did not expose the required tool"
            message["tool_calls"] = [{"function": {"name": name, "arguments": arguments}}]
        self.responses += 1
        return {"model": MODEL, "message": message, "done": True, "done_reason": "stop"}


@contextmanager
def model_endpoint(conversation: ScriptedConversation):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            self.connection.settimeout(10)
            try:
                assert self.path == "/api/chat"
                size = int(self.headers.get("Content-Length", "0"))
                assert 0 < size <= 256 * 1024
                response = conversation.respond(json.loads(self.rfile.read(size)))
                body = (json.dumps(response) + "\n").encode()
                status = 200
            except Exception as error:
                conversation.failure = type(error).__name__
                body = b'{"error":"Documented example model contract failed"}\n'
                status = 400
            self.send_response(status)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive(), "Model fixture did not shut down"


def execute(program: Path, directory: Path, conversation: ScriptedConversation, sandbox_id=None):
    env = {
        name: value
        for name, value in os.environ.items()
        if name
        in {
            "PATH",
            "HOME",
            "SSL_CERT_FILE",
            "HARAKIRI_API_URL",
            "HARAKIRI_API_KEY",
            "HARAKIRI_TEMPLATE",
        }
    }
    if program.name == "first_local.py":
        env = {name: value for name, value in env.items() if not name.startswith("HARAKIRI_")}
    if sandbox_id is not None:
        env["HARAKIRI_SANDBOX_ID"] = sandbox_id
    env.update(PYTHONNOUSERSITE="1", LANGSMITH_TRACING="false", LANGCHAIN_TRACING_V2="false")
    with model_endpoint(conversation) as endpoint:
        env.update(OLLAMA_HOST=endpoint, HARAKIRI_AGENT_MODEL=f"ollama:{MODEL}")
        result = subprocess.run(
            [sys.executable, str(program)],
            cwd=directory,
            env=env,
            check=True,
            capture_output=True,
            text=True,
            timeout=240,
        )
    assert conversation.failure is None and conversation.completed
    expected = conversation.workdir if conversation.existing else GREETING
    assert result.stdout.strip() == expected


def main():
    assert os.environ.get("HARAKIRI_PYTHON_ACCEPTANCE") == "disposable-runner"
    assert os.environ.get("GITHUB_ACTIONS") == "true"
    assert os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
    assert platform.system() == "Linux" and platform.machine() == "x86_64"
    programs = Path("documented-programs").resolve()
    names = ("first_local.py", "first_sandbox.py", "first_async.py", "first_existing.py")
    receipt = {
        "kind": "installed-documentation-examples",
        "inference": "deterministic-ollama-protocol-fixture-not-a-real-model",
        "tools": "real-local-shell-and-harakiri-runtime",
        "sources": {
            file.name: hashlib.sha256(file.read_bytes()).hexdigest()
            for file in sorted(programs.glob("*.py"))
        },
        "results": [],
    }
    for name in names:
        receipt["activeProgram"] = name
        Path("documented-examples-result.json").write_text(json.dumps(receipt, indent=2) + "\n")
        directory = Path(f"example-{Path(name).stem}").resolve()
        directory.mkdir()
        with HarakiriClient.from_env() as client:
            before = {sandbox.id for sandbox in client.sandboxes.list()}
            assert client.capacity.get().in_use == 0
            if name == "first_existing.py":
                with client.sandboxes.task(template=os.environ["HARAKIRI_TEMPLATE"]) as sandbox:
                    conversation = ScriptedConversation(workdir=sandbox.workdir, existing=True)
                    execute(programs / name, directory, conversation, sandbox.id)
                    assert sandbox.refresh().status in {"running", "idle"}
                    assert (
                        sandbox.run("printf borrowed-survived", check=True).stdout.strip()
                        == "borrowed-survived"
                    )
                assert sandbox.refresh().capacity_phase == "released"
            else:
                workdir = (
                    str(directory / "deepagents-local")
                    if name == "first_local.py"
                    else client.templates.get(os.environ["HARAKIRI_TEMPLATE"]).workdir
                )
                conversation = ScriptedConversation(
                    workdir=workdir, virtual_paths=name == "first_local.py"
                )
                execute(programs / name, directory, conversation)
                created = [
                    sandbox for sandbox in client.sandboxes.list() if sandbox.id not in before
                ]
                if name == "first_local.py":
                    assert not created
                    assert (directory / "deepagents-local/hello.sh").read_text() == SCRIPT
                else:
                    assert len(created) == 1
                    assert created[0].runtime_metadata.workdir == workdir
                    assert (
                        created[0].status == "terminated"
                        and created[0].capacity_phase == "released"
                    )
            assert client.capacity.get().in_use == 0
        receipt["results"].append(
            {"program": name, "status": "passed", "modelResponses": conversation.responses}
        )
        receipt.pop("activeProgram")
        Path("documented-examples-result.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        result_file = Path("documented-examples-result.json")
        if result_file.exists():
            result = json.loads(result_file.read_text())
            frames = []
            traceback = error.__traceback__
            while traceback:
                frames.append(
                    {"function": traceback.tb_frame.f_code.co_name, "line": traceback.tb_lineno}
                )
                traceback = traceback.tb_next
            result["failure"] = {"type": type(error).__name__, "frames": frames[-4:]}
            result_file.write_text(json.dumps(result, indent=2) + "\n")
        raise
