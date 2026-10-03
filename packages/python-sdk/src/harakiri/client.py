"""Native async client. Closing it never changes remote resource lifetimes."""

from __future__ import annotations

from collections.abc import Mapping
from types import TracebackType

import httpx

from ._config import ClientConfig
from ._transport import Transport
from .resources import AsyncCapacity, AsyncRuntime, AsyncTemplates, AsyncWorkspaces
from .sandboxes import AsyncSandboxes


class AsyncHarakiriClient:
    def __init__(
        self,
        *,
        api_url: str,
        api_key: str,
        request_timeout: float = 120,
        ca_bundle: str | None = None,
        trust_env: bool = False,
        max_response_bytes: int = 24 * 1024 * 1024,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        config = ClientConfig(
            api_url, api_key, request_timeout, ca_bundle, trust_env, max_response_bytes
        )
        self._transport = Transport(config, http_client)
        self.sandboxes = AsyncSandboxes(self._transport)
        self.templates = AsyncTemplates(self._transport)
        self.workspaces = AsyncWorkspaces(self._transport)
        self.runtime = AsyncRuntime(self._transport)
        self.capacity = AsyncCapacity(self._transport)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> AsyncHarakiriClient:
        config = ClientConfig.from_env(env)
        return cls(api_url=config.api_url, api_key=config.api_key)

    async def __aenter__(self) -> AsyncHarakiriClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.close()

    async def close(self) -> None:
        await self._transport.close()
