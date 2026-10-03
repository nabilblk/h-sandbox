"""Small discovery and retained-workspace resource clients."""

from __future__ import annotations

from ._transport import Transport, segment
from .models import (
    Capacity,
    CapacityResponse,
    RuntimeCapabilities,
    Template,
    TemplateResponse,
    TemplatesResponse,
    Workspace,
    WorkspaceResponse,
    WorkspacesResponse,
)


class AsyncTemplates:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    async def list(self, *, request_timeout: float | None = None) -> list[Template]:
        result = await self._transport.request(
            "GET", "/v1/templates", TemplatesResponse, request_timeout=request_timeout
        )
        return result.templates

    async def get(self, template_id: str, *, request_timeout: float | None = None) -> Template:
        result = await self._transport.request(
            "GET",
            f"/v1/templates/{segment(template_id)}",
            TemplateResponse,
            request_timeout=request_timeout,
        )
        return result.template


class AsyncWorkspaces:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    async def list(self, *, request_timeout: float | None = None) -> WorkspacesResponse:
        return await self._transport.request(
            "GET", "/v1/workspaces", WorkspacesResponse, request_timeout=request_timeout
        )

    async def create(self, name: str, *, request_timeout: float | None = None) -> Workspace:
        if not name.strip():
            raise ValueError("Workspace name must be nonempty")
        result = await self._transport.request(
            "POST",
            "/v1/workspaces",
            WorkspaceResponse,
            body={"name": name},
            request_timeout=request_timeout,
        )
        return result.workspace

    async def get(self, workspace_id: str, *, request_timeout: float | None = None) -> Workspace:
        result = await self._transport.request(
            "GET",
            f"/v1/workspaces/{segment(workspace_id)}",
            WorkspaceResponse,
            request_timeout=request_timeout,
        )
        return result.workspace

    async def archive(
        self, workspace_id: str, *, request_timeout: float | None = None
    ) -> Workspace:
        result = await self._transport.request(
            "POST",
            f"/v1/workspaces/{segment(workspace_id)}/archive",
            WorkspaceResponse,
            request_timeout=request_timeout,
        )
        return result.workspace


class AsyncRuntime:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    async def capabilities(self, *, request_timeout: float | None = None) -> RuntimeCapabilities:
        return await self._transport.request(
            "GET", "/v1/runtime/capabilities", RuntimeCapabilities, request_timeout=request_timeout
        )


class AsyncCapacity:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    async def get(self, *, request_timeout: float | None = None) -> Capacity:
        result = await self._transport.request(
            "GET", "/v1/org/capacity", CapacityResponse, request_timeout=request_timeout
        )
        return result.capacity
