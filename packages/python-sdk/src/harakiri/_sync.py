"""One lazy portal per sync client; no per-request worker threads or loop hijacking."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager, AbstractContextManager
from functools import partial
from threading import Lock
from typing import ParamSpec, TypeVar

from anyio.from_thread import BlockingPortal, start_blocking_portal

P = ParamSpec("P")
T = TypeVar("T")


class Bridge:
    def __init__(self) -> None:
        self._manager: AbstractContextManager[BlockingPortal] | None = None
        self._portal: BlockingPortal | None = None
        self._lock = Lock()
        self._closed = False

    def _open(self) -> BlockingPortal:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise RuntimeError("Use AsyncHarakiriClient inside an event loop")
        with self._lock:
            if self._closed:
                raise RuntimeError("This Harakiri client is closed")
            if self._portal is None:
                self._manager = start_blocking_portal(name="harakiri-http")
                self._portal = self._manager.__enter__()
            return self._portal

    def call(self, function: Callable[P, Awaitable[T]], *args: P.args, **kwargs: P.kwargs) -> T:
        future = self._open().start_task_soon(partial(function, *args, **kwargs))
        try:
            return future.result()
        except BaseException:
            future.cancel()
            raise

    def context(self, context: AbstractAsyncContextManager[T]) -> AbstractContextManager[T]:
        return self._open().wrap_async_context_manager(context)

    def close(self, close_http: Callable[[], Awaitable[None]]) -> None:
        if self._closed:
            return
        try:
            self.call(close_http)
        finally:
            self._closed = True
            if self._manager is not None:
                self._manager.__exit__(None, None, None)
