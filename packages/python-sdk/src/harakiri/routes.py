"""Protected service grants. Application access never inherits control-plane credentials."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Literal
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

import httpx

from ._config import seconds
from ._observation import Deadline
from ._transport import Transport, segment
from .errors import ProtocolError, RequestError
from .models import RouteConnection, RouteResponse, RoutesResponse, RouteSummary


def _port(port: int) -> int:
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError("Port must be an integer between 1 and 65535")
    return port


def _scoped_url(base_url: str, path: str) -> str:
    base = urlsplit(base_url)
    prefix = base.path.rstrip("/")
    relative = path[1:] if path.startswith("/") and not path.startswith("//") else path
    url = urlsplit(urljoin(urlunsplit(base._replace(path=prefix + "/")), relative))
    if (
        base.scheme not in {"http", "https"}
        or base.username
        or base.password
        or base.query
        or base.fragment
        or url.scheme != base.scheme
        or url.netloc != base.netloc
        or url.username
        or url.password
        or url.fragment
        or not (url.path == prefix or url.path.startswith(prefix + "/"))
        or "\\" in path
        or re.search(r"%(?:2f|5c|25|00)", url.path, re.IGNORECASE)
        or any(part in {".", ".."} for part in unquote(path.split("?", 1)[0]).split("/"))
        or any(ord(char) < 32 or ord(char) == 127 for char in path)
        or any(ord(char) < 32 or ord(char) == 127 for char in unquote(url.path))
    ):
        raise ValueError("Service requests must remain inside their route origin and path")
    return urlunsplit(url)


class AsyncRoute:
    def __init__(self, transport: Transport, sandbox_id: str, response: RouteResponse) -> None:
        if response.sandbox_id is not None and response.sandbox_id != sandbox_id:
            raise ProtocolError("Route sandbox identity does not match its request", method="GET")
        self._transport, self._sandbox_id = transport, sandbox_id
        self.grant = response.model_copy(update={"sandbox_id": sandbox_id})
        self.route = response.route

    @property
    def url(self) -> str:
        return self.route.url

    def connection(
        self,
        path: str = "/",
        *,
        headers: Mapping[str, str] | None = None,
        websocket: bool = False,
    ) -> RouteConnection:
        url = _scoped_url(self.url, path)
        scoped_headers = httpx.Headers(headers)
        if self.route.access_mode == "token":
            if not self.grant.access_token:
                raise ValueError("This protected route requires its original one-time access token")
            name = self.grant.access_header_name or self.route.access_header_name
            if name != "x-harakiri-route-token":
                raise ValueError("Unsupported route credential header")
            scoped_headers[name] = self.grant.access_token
        if websocket:
            parsed = urlsplit(url)
            url = urlunsplit(parsed._replace(scheme="wss" if parsed.scheme == "https" else "ws"))
        return RouteConnection(url=url, headers=dict(scoped_headers))

    async def request(
        self,
        method: str = "GET",
        path: str = "/",
        *,
        headers: Mapping[str, str] | None = None,
        content: str | bytes | None = None,
        json: object = None,
        request_timeout: float | None = None,
    ) -> httpx.Response:
        connection = self.connection(path, headers=headers)
        return await self._transport.service_request(
            method, connection, content=content, json=json, request_timeout=request_timeout
        )

    async def wait_for_http(
        self,
        path: str = "/",
        *,
        headers: Mapping[str, str] | None = None,
        timeout: float = 30,
        poll_interval: float = 0.5,
    ) -> httpx.Response:
        deadline = Deadline(timeout, self.route.route_key)
        seconds(poll_interval, "poll_interval")
        while True:
            try:
                response = await self.request(
                    "GET", path, headers=headers, request_timeout=deadline.remaining()
                )
                deadline.last_status = str(response.status_code)
                if response.is_success:
                    return response
                if response.status_code in {401, 403, 404, 410}:
                    # Missing grants and deleted services are not transient readiness failures.
                    response.raise_for_status()
            except RequestError:
                deadline.remaining()
            await deadline.pause(poll_interval)

    async def delete(self, *, request_timeout: float | None = None) -> RouteSummary:
        return await AsyncRoutes(self._transport, self._sandbox_id).delete(
            self.route.port, request_timeout=request_timeout
        )


class AsyncRoutes:
    def __init__(self, transport: Transport, sandbox_id: str) -> None:
        self._transport, self._sandbox_id = transport, sandbox_id
        self._path = f"/v1/sandboxes/{segment(sandbox_id)}/routes"

    def connect(self, grant: RouteResponse) -> AsyncRoute:
        """Restore a persisted grant without creating a new exposure or disclosing another token."""
        return AsyncRoute(self._transport, self._sandbox_id, grant)

    async def list(self, *, request_timeout: float | None = None) -> list[RouteSummary]:
        result = await self._transport.request(
            "GET", self._path, RoutesResponse, request_timeout=request_timeout
        )
        return result.routes

    async def expose(
        self,
        port: int,
        *,
        access_mode: Literal["token", "public"] = "token",
        protocol: Literal["http", "https"] = "http",
        request_timeout: float | None = None,
    ) -> AsyncRoute:
        if access_mode not in {"token", "public"} or protocol not in {"http", "https"}:
            raise ValueError("Invalid route access mode or protocol")
        result = await self._transport.request(
            "POST",
            self._path,
            RouteResponse,
            body={"port": _port(port), "accessMode": access_mode, "protocol": protocol},
            request_timeout=request_timeout,
        )
        return self.connect(result)

    async def delete(self, port: int, *, request_timeout: float | None = None) -> RouteSummary:
        result = await self._transport.request(
            "DELETE",
            f"{self._path}/{_port(port)}",
            RouteResponse,
            request_timeout=request_timeout,
        )
        return result.route
