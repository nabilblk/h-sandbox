from __future__ import annotations

import base64
import hashlib
import json

import httpx
import pytest

NOW = "2026-10-01T12:00:00Z"


def sandbox_summary(status="running", capacity_phase="active"):
    return {
        "id": "sbx_test",
        "name": "test",
        "template": "fixture",
        "status": status,
        "ttlSeconds": 300,
        "expiresAt": NOW,
        "createdAt": NOW,
        "capacityPhase": capacity_phase,
        "workspaceId": "ws_retained",
        "runtimeMetadata": {
            "workdir": "/workspace",
            "shell": "bash",
            "user": "sandbox",
            "limits": {"fileArtifactMaxBytes": 16 * 1024 * 1024, "commandTimeoutMs": 60000},
        },
    }


class FakeAPI:
    """Wire fixture only: never executes shell commands or provisions real resources."""

    def __init__(self):
        self.requests = []
        self.status = "running"
        self.capacity_phase = "active"
        self.ready = "ready"
        self.delete_error = False
        self.files = {}
        self.command_status = "succeeded"

    def __call__(self, request):
        self.requests.append(request)
        path, method = request.url.path, request.method
        payload = json.loads(request.content) if request.content else {}
        summary = sandbox_summary(self.status, self.capacity_phase)
        if method == "POST" and path == "/v1/sandboxes":
            return httpx.Response(202, json={"sandbox": summary, "status": "pending"})
        if method == "DELETE" and path == "/v1/sandboxes/sbx_test":
            if self.delete_error:
                return httpx.Response(503, json={"error": "runtime_unavailable"})
            self.status, self.capacity_phase = "terminated", "released"
            return httpx.Response(200, json={"ok": True})
        if method == "GET" and path == "/v1/sandboxes/sbx_test":
            return httpx.Response(200, json={"sandbox": summary})
        if path.endswith("/readiness"):
            return httpx.Response(
                200,
                json={
                    "sandbox": summary,
                    "readiness": {
                        "status": self.ready,
                        "checkedAt": NOW,
                    },
                },
            )
        if path.endswith("/run"):
            return httpx.Response(
                200,
                json={
                    "result": {
                        "sandboxId": "sbx_test",
                        "command": payload["command"],
                        "stdout": "hello\n",
                        "stderr": "",
                        "exitCode": 0,
                        "durationMs": 12,
                    }
                },
            )
        if path.endswith("/commands") or path.endswith("/commands/cmd_test"):
            return httpx.Response(
                200,
                json={
                    "command": {
                        "id": "cmd_test",
                        "sandboxId": "sbx_test",
                        "status": self.command_status,
                        "exitCode": 0 if self.command_status == "succeeded" else None,
                        "finishReason": "exit" if self.command_status == "succeeded" else None,
                    }
                },
            )
        if path.endswith("/commands/cmd_test/logs"):
            return httpx.Response(
                200, json={"commandId": "cmd_test", "stdout": "done\n", "stderr": ""}
            )
        if path.endswith("/files/upload") or path.endswith("/files") and method == "PUT":
            content = (
                base64.b64decode(payload["contentBase64"])
                if "contentBase64" in payload
                else payload["content"].encode()
            )
            self.files[payload["path"]] = content
            result = {"file": self.entry(payload["path"], content)}
            if "contentBase64" in payload:
                result.update(self.metadata(content))
            return httpx.Response(200, json=result)
        if path.endswith(("/files/read", "/files/download", "/files/stat")):
            name = request.url.params["path"]
            if name not in self.files:
                return httpx.Response(404, json={"error": "file_not_found"})
            content = self.files[name]
            if path.endswith("/stat"):
                return httpx.Response(200, json={"file": self.entry(name, content)})
            if path.endswith("/read"):
                return httpx.Response(
                    200, json={"path": name, "encoding": "utf8", "content": content.decode()}
                )
            return httpx.Response(
                200,
                json={
                    "path": name,
                    "contentBase64": base64.b64encode(content).decode(),
                    **self.metadata(content),
                },
            )
        raise AssertionError(f"Unexpected fixture request: {method} {path}")

    @staticmethod
    def entry(path, content):
        return {"path": path, "name": path.rsplit("/", 1)[-1], "type": "file", "size": len(content)}

    @staticmethod
    def metadata(content):
        return {
            "sizeBytes": len(content),
            "sha256": "sha256:" + hashlib.sha256(content).hexdigest(),
            "transfer": {"mode": "json-base64", "encoding": "base64", "maxBytes": 16 * 1024 * 1024},
        }


@pytest.fixture
def api():
    return FakeAPI()


@pytest.fixture
def http(api):
    return httpx.AsyncClient(transport=httpx.MockTransport(api))
