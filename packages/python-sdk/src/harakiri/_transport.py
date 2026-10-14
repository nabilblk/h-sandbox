"""One bounded HTTP implementation for native async and the synchronous facade."""

from __future__ import annotations

import json
import re
from time import monotonic
from typing import TypeVar

import anyio
import httpx
from pydantic import ValidationError as ModelValidationError

from ._config import ClientConfig, seconds
from .errors import (
    ApiError,
    AuthenticationError,
    AuthorizationError,
    CapacityError,
    ConflictError,
    NotFoundError,
    ProtocolError,
    ProviderError,
    RateLimitError,
    RequestError,
    RequestTimeoutError,
    UnsupportedError,
    ValidationError,
)
from .models import Capacity, Model

Response = TypeVar("Response", bound=Model)
Query = dict[str, str | int | bool]


def segment(value: str) -> str:
    from urllib.parse import quote

    if not value or value in {".", ".."} or any(ord(char) < 32 for char in value):
        raise ValueError("Resource IDs must be nonempty and cannot contain control characters")
    return quote(value, safe="")


def api_error(status: int, body: bytearray) -> ApiError:
    code = "http_error"
    capacity = None
    if len(body) <= 256 * 1024:
        try:
            payload = json.loads(body)
            candidate = payload.get("error") if isinstance(payload, dict) else None
            if isinstance(candidate, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,95}", candidate):
                code = candidate
            if isinstance(payload, dict) and payload.get("capacity"):
                capacity = Capacity.model_validate(payload["capacity"])
        except (ValueError, TypeError):
            pass
    error_type: type[ApiError] = {
        400: ValidationError,
        401: AuthenticationError,
        403: AuthorizationError,
        404: NotFoundError,
        409: ConflictError,
        429: RateLimitError,
        501: UnsupportedError,
        502: ProviderError,
        503: ProviderError,
        504: ProviderError,
    }.get(status, ApiError)
    if code in {"organization_capacity_exceeded", "organization_capacity_unavailable"}:
        error_type = CapacityError
    return error_type(status, code, capacity=capacity)


class Transport:
    def __init__(self, config: ClientConfig, http_client: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self._owned = http_client is None
        self._http = http_client or httpx.AsyncClient(
            verify=config.tls_context(),
            trust_env=config.trust_env,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        self._closed = False

    async def close(self) -> None:
        if not self._closed:
            self._closed = True
            if self._owned:
                await self._http.aclose()

    async def request(
        self,
        method: str,
        path: str,
        response_type: type[Response],
        *,
        body: dict[str, object] | None = None,
        params: Query | None = None,
        request_timeout: float | None = None,
    ) -> Response:
        if self._closed:
            raise RuntimeError("This Harakiri client is closed")
        if not path.startswith("/v1/") or "?" in path or "#" in path:
            raise ValueError("Only Harakiri API paths are accepted")
        timeout = seconds(
            self.config.request_timeout if request_timeout is None else request_timeout,
            "request_timeout",
        )
        started = monotonic()
        try:
            with anyio.fail_after(timeout):
                async with self._http.stream(
                    method,
                    self.config.api_url + path,
                    json=body,
                    params=params,
                    headers={
                        "x-api-key": self.config.api_key,
                        "accept": "application/json",
                        "accept-encoding": "identity",
                    },
                    follow_redirects=False,
                    timeout=timeout,
                ) as response:
                    if response.headers.get("content-encoding", "identity") != "identity":
                        raise ProtocolError(
                            "Compressed API responses are not accepted", method=method
                        )
                    raw = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=32 * 1024):
                        if len(raw) + len(chunk) > self.config.max_response_bytes:
                            raise ProtocolError(
                                "API response exceeds the configured byte limit", method=method
                            )
                        raw.extend(chunk)
                    if not 200 <= response.status_code < 300:
                        raise api_error(response.status_code, raw)
                    try:
                        result = response_type.model_validate_json(raw)
                    except ModelValidationError:
                        # Pydantic diagnostics can contain file content or secrets from the body.
                        raise ProtocolError(
                            "API response does not match its contract", method=method
                        ) from None
                    if monotonic() - started >= timeout:
                        raise TimeoutError
                    return result
        except (TimeoutError, httpx.TimeoutException) as cause:
            raise RequestTimeoutError(
                "Local API request deadline expired", method=method
            ) from cause
        except httpx.HTTPError as cause:
            raise RequestError(
                "API transport failed; the remote outcome may be unknown", method=method
            ) from cause
