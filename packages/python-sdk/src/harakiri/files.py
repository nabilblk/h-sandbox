"""Buffered, integrity-checked remote file operations."""

from __future__ import annotations

import base64
import binascii
import hashlib

from ._transport import Query, Transport, segment
from .errors import IntegrityError
from .models import (
    DownloadResponse,
    FileEntry,
    FileList,
    FileResponse,
    FileText,
    Ok,
    UploadResponse,
)


def remote_path(path: str, workdir: str) -> str:
    if not path or "\0" in path:
        raise ValueError("A nonempty path without NUL characters is required")
    return path if path.startswith("/") else f"{workdir.rstrip('/')}/{path}"


def checksum(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


def decode_artifact(result: DownloadResponse, maximum: int) -> bytes:
    if result.size_bytes > min(maximum, result.transfer.max_bytes):
        raise IntegrityError("Downloaded file exceeds the buffered artifact limit")
    if len(result.content_base64) != 4 * ((result.size_bytes + 2) // 3):
        raise IntegrityError("Downloaded encoding does not match the declared size")
    try:
        content = base64.b64decode(result.content_base64, validate=True)
    except (ValueError, binascii.Error):
        raise IntegrityError("Downloaded content is not valid base64") from None
    if len(content) != result.size_bytes or checksum(content) != result.sha256:
        raise IntegrityError("Downloaded size or SHA-256 does not match")
    return content


class AsyncFiles:
    def __init__(self, transport: Transport, sandbox_id: str, workdir: str, max_bytes: int) -> None:
        self._transport = transport
        self._path = f"/v1/sandboxes/{segment(sandbox_id)}/files"
        self._workdir = workdir
        self._maximum = max_bytes

    def _resolve(self, path: str) -> str:
        return remote_path(path, self._workdir)

    async def list(self, path: str = ".", *, request_timeout: float | None = None) -> FileList:
        return await self._transport.request(
            "GET",
            self._path,
            FileList,
            params={"path": self._resolve(path)},
            request_timeout=request_timeout,
        )

    async def stat(self, path: str, *, request_timeout: float | None = None) -> FileEntry:
        result = await self._transport.request(
            "GET",
            self._path + "/stat",
            FileResponse,
            params={"path": self._resolve(path)},
            request_timeout=request_timeout,
        )
        return result.file

    async def read_text(self, path: str, *, request_timeout: float | None = None) -> str:
        result = await self._transport.request(
            "GET",
            self._path + "/read",
            FileText,
            params={"path": self._resolve(path), "encoding": "utf8"},
            request_timeout=request_timeout,
        )
        if result.encoding != "utf8":
            raise IntegrityError("The response is not UTF-8 text")
        if len(result.content.encode("utf-8")) > self._maximum:
            raise IntegrityError("Text exceeds the buffered file limit")
        return result.content

    async def read_bytes(self, path: str, *, request_timeout: float | None = None) -> bytes:
        result = await self._transport.request(
            "GET",
            self._path + "/download",
            DownloadResponse,
            params={"path": self._resolve(path)},
            request_timeout=request_timeout,
        )
        return decode_artifact(result, self._maximum)

    async def write(
        self,
        path: str,
        content: str | bytes,
        *,
        create_parents: bool = True,
        mode: str | None = None,
        request_timeout: float | None = None,
    ) -> FileEntry:
        if not isinstance(content, (str, bytes)):
            raise TypeError("File content must be str or bytes")
        size = len(content.encode("utf-8")) if isinstance(content, str) else len(content)
        if size > self._maximum:
            raise ValueError("File exceeds the sandbox's buffered artifact limit")
        body: dict[str, object] = {"path": self._resolve(path), "createParents": create_parents}
        if mode is not None:
            body["mode"] = mode
        if isinstance(content, str):
            body.update(content=content, encoding="utf8")
            result = await self._transport.request(
                "PUT", self._path, FileResponse, body=body, request_timeout=request_timeout
            )
            return result.file
        digest = checksum(content)
        body.update(
            contentBase64=base64.b64encode(content).decode("ascii"), sizeBytes=size, sha256=digest
        )
        uploaded = await self._transport.request(
            "POST",
            self._path + "/upload",
            UploadResponse,
            body=body,
            request_timeout=request_timeout,
        )
        if uploaded.size_bytes != size or uploaded.sha256 != digest:
            raise IntegrityError("Uploaded size or SHA-256 does not match")
        return uploaded.file

    async def mkdir(
        self, path: str, *, recursive: bool = True, request_timeout: float | None = None
    ) -> FileEntry:
        result = await self._transport.request(
            "POST",
            self._path + "/mkdir",
            FileResponse,
            body={"path": self._resolve(path), "recursive": recursive},
            request_timeout=request_timeout,
        )
        return result.file

    async def rename(
        self, source: str, destination: str, *, request_timeout: float | None = None
    ) -> FileEntry:
        result = await self._transport.request(
            "POST",
            self._path + "/rename",
            FileResponse,
            body={"fromPath": self._resolve(source), "toPath": self._resolve(destination)},
            request_timeout=request_timeout,
        )
        return result.file

    async def remove(
        self, path: str, *, recursive: bool = False, request_timeout: float | None = None
    ) -> None:
        # Older servers coerce any nonempty query string, including "false", to true.
        params: Query = {"path": self._resolve(path)}
        if recursive:
            params["recursive"] = "true"
        await self._transport.request(
            "DELETE",
            self._path,
            Ok,
            params=params,
            request_timeout=request_timeout,
        )
