"""Core-only 16 MiB transfer regression; Linux enforces a 256 MiB address-space limit."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import sys

import httpx
from harakiri import AsyncHarakiriClient


async def main() -> None:
    if sys.platform == "linux":
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (256 << 20, 256 << 20))
    size = 16 << 20
    digest = "sha256:" + hashlib.sha256(b"a" * size).hexdigest()
    transfers = {"mode": "json-base64", "encoding": "base64", "maxBytes": size}

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/upload"):
            body = json.loads(request.content)
            assert body["sizeBytes"] == size and body["sha256"] == digest
            assert hashlib.sha256(base64.b64decode(body["contentBase64"])).hexdigest() == digest[7:]
            return httpx.Response(
                200,
                json={
                    "file": {
                        "path": "/workspace/data",
                        "name": "data",
                        "type": "file",
                        "size": size,
                    },
                    "sizeBytes": size,
                    "sha256": digest,
                    "transfer": transfers,
                },
            )
        if request.url.path.endswith("/download"):
            return httpx.Response(
                200,
                json={
                    "path": "/workspace/data",
                    "sizeBytes": size,
                    "sha256": digest,
                    "transfer": transfers,
                    "contentBase64": base64.b64encode(b"a" * size).decode(),
                },
            )
        return httpx.Response(
            200,
            json={
                "sandbox": {
                    "id": "sbx_memory",
                    "name": "memory",
                    "template": "fixture",
                    "status": "running",
                    "ttlSeconds": 300,
                    "expiresAt": None,
                    "createdAt": "2026-10-01T12:00:00Z",
                    "runtimeMetadata": {
                        "workdir": "/workspace",
                        "shell": "bash",
                        "user": "sandbox",
                        "limits": {"fileArtifactMaxBytes": size, "commandTimeoutMs": 60000},
                    },
                }
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        async with AsyncHarakiriClient(
            api_url="https://fixture.test", api_key="fixture", http_client=http
        ) as client:
            sandbox = await client.sandboxes.connect("sbx_memory")
            await sandbox.files.write("data", b"a" * size)
            received = await sandbox.files.read_bytes("data")
            assert (
                len(received) == size and "sha256:" + hashlib.sha256(received).hexdigest() == digest
            )
    evidence = {
        "bytes": size,
        "status": "passed",
        "platform": sys.platform,
        "linux_address_space_limit": 256 << 20 if sys.platform == "linux" else None,
    }
    if sys.platform != "win32":
        import resource

        evidence["peak_rss_bytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (
            1 if sys.platform == "darwin" else 1024
        )
    print(json.dumps(evidence))


if __name__ == "__main__":
    asyncio.run(main())
