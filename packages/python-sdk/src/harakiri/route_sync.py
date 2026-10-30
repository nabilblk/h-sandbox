"""Synchronous service facade sharing the client's existing portal."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

import httpx

from ._sync import Bridge
from .models import RouteConnection, RouteResponse, RouteSummary
from .routes import AsyncRoute, AsyncRoutes


class Route:
    def __init__(self, bridge: Bridge, resource: AsyncRoute) -> None:
        self._bridge, self._resource = bridge, resource

    @property
    def route(self) -> RouteSummary:
        return self._resource.route

    @property
    def grant(self) -> RouteResponse:
        return self._resource.grant

    @property
    def url(self) -> str:
        return self._resource.url

    def connection(
        self, path: str = "/", *, headers: Mapping[str, str] | None = None, websocket: bool = False
    ) -> RouteConnection:
        return self._resource.connection(path, headers=headers, websocket=websocket)

    def request(
        self,
        method: str = "GET",
        path: str = "/",
        *,
        headers: Mapping[str, str] | None = None,
        content: str | bytes | None = None,
        json: object = None,
        request_timeout: float | None = None,
    ) -> httpx.Response:
        return self._bridge.call(
            self._resource.request,
            method,
            path,
            headers=headers,
            content=content,
            json=json,
            request_timeout=request_timeout,
        )

    def wait_for_http(
        self,
        path: str = "/",
        *,
        headers: Mapping[str, str] | None = None,
        timeout: float = 30,
        poll_interval: float = 0.5,
    ) -> httpx.Response:
        return self._bridge.call(
            self._resource.wait_for_http,
            path,
            headers=headers,
            timeout=timeout,
            poll_interval=poll_interval,
        )

    def delete(self, *, request_timeout: float | None = None) -> RouteSummary:
        return self._bridge.call(self._resource.delete, request_timeout=request_timeout)


class Routes:
    def __init__(self, bridge: Bridge, resource: AsyncRoutes) -> None:
        self._bridge, self._resource = bridge, resource

    def connect(self, grant: RouteResponse) -> Route:
        return Route(self._bridge, self._resource.connect(grant))

    def list(self, *, request_timeout: float | None = None) -> list[RouteSummary]:
        return self._bridge.call(self._resource.list, request_timeout=request_timeout)

    def expose(
        self,
        port: int,
        *,
        access_mode: Literal["token", "public"] = "token",
        protocol: Literal["http", "https"] = "http",
        request_timeout: float | None = None,
    ) -> Route:
        return Route(
            self._bridge,
            self._bridge.call(
                self._resource.expose,
                port,
                access_mode=access_mode,
                protocol=protocol,
                request_timeout=request_timeout,
            ),
        )

    def delete(self, port: int, *, request_timeout: float | None = None) -> RouteSummary:
        return self._bridge.call(self._resource.delete, port, request_timeout=request_timeout)
