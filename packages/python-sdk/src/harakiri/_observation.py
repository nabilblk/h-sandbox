from __future__ import annotations

from time import monotonic

import anyio

from ._config import seconds
from .errors import ObservationTimeoutError


class Deadline:
    def __init__(self, timeout: float, resource_id: str) -> None:
        self._end = monotonic() + seconds(timeout)
        self.resource_id = resource_id
        self.last_status: str | None = None

    def remaining(self) -> float:
        remaining = self._end - monotonic()
        if remaining <= 0:
            raise ObservationTimeoutError(self.resource_id, self.last_status)
        return remaining

    async def pause(self, interval: float) -> None:
        await anyio.sleep(min(seconds(interval, "poll_interval"), self.remaining()))
