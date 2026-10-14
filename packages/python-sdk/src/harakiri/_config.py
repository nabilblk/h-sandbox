"""Validated, secret-safe configuration shared by both client modes."""

from __future__ import annotations

import math
import os
import ssl
from collections.abc import Mapping
from dataclasses import dataclass, field
from urllib.parse import urlsplit


def seconds(value: float, name: str = "timeout") -> float:
    if isinstance(value, bool) or not math.isfinite(value) or not 0 < value <= 2_147_483:
        raise ValueError(f"{name} must be finite, positive and at most 2147483 seconds")
    return float(value)


def milliseconds(value: float) -> int:
    return max(1, math.ceil(seconds(value) * 1000))


@dataclass(frozen=True, slots=True)
class ClientConfig:
    api_url: str
    api_key: str = field(repr=False)
    request_timeout: float = 120
    ca_bundle: str | None = None
    trust_env: bool = False
    max_response_bytes: int = 24 * 1024 * 1024

    def __post_init__(self) -> None:
        url = urlsplit(self.api_url)
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username is not None
            or url.password is not None
            or "?" in self.api_url
            or "#" in self.api_url
            or any(ord(char) < 33 for char in self.api_url)
            or "\\" in self.api_url
        ):
            raise ValueError(
                "api_url must be an HTTP(S) URL without credentials, query or fragment"
            )
        # Reading port validates malformed authorities before any network request.
        _ = url.port
        if not self.api_key or any(not 33 <= ord(char) <= 126 for char in self.api_key):
            raise ValueError("api_key must be a nonempty ASCII token without whitespace")
        seconds(self.request_timeout, "request_timeout")
        if (
            isinstance(self.max_response_bytes, bool)
            or not isinstance(self.max_response_bytes, int)
            or not 1024 <= self.max_response_bytes <= 64 << 20
        ):
            raise ValueError("max_response_bytes must be between 1 KiB and 64 MiB")
        object.__setattr__(self, "api_url", self.api_url.rstrip("/"))

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> ClientConfig:
        source = os.environ if env is None else env
        for name in ("HARAKIRI_API_URL", "HARAKIRI_API_KEY"):
            if not source.get(name):
                raise ValueError(f"Set {name} before creating the client")
        return cls(api_url=source["HARAKIRI_API_URL"], api_key=source["HARAKIRI_API_KEY"])

    def tls_context(self) -> ssl.SSLContext:
        return ssl.create_default_context(cafile=self.ca_bundle)
