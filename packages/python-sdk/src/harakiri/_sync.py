"""One lazy portal per sync client; no per-request worker threads or loop hijacking."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from concurrent.futures import Future, wait
from contextlib import AbstractAsyncContextManager, AbstractContextManager
from functools import partial
from threading import Lock
from types import TracebackType
from typing import ParamSpec, TypeVar

from anyio.from_thread import BlockingPortal, start_blocking_portal

P = ParamSpec("P")
T = TypeVar("T")


class _PortalContext(AbstractContextManager[T]):
    """Keep entry and exit in one portal task, including interrupted entry."""

    def __init__(self, portal: BlockingPortal, context: AbstractAsyncContextManager[T]) -> None:
        self._portal, self._context = portal, context
        self._entered: Future[T] = Future()
        self._finished: Future[bool] = Future()
        self._runner: Future[None] | None = None
        self._exit_event: asyncio.Event
        self._exception: BaseException | None = None
        self._traceback: TracebackType | None = None

    async def _run(self) -> None:
        self._exit_event = asyncio.Event()
        try:
            async with self._context as value:
                self._entered.set_result(value)
                await self._exit_event.wait()
                if self._exception is not None:
                    raise self._exception.with_traceback(self._traceback)
        except BaseException as error:
            # Deliver failures to the caller without cancelling unrelated portal tasks.
            if not self._entered.done():
                self._entered.set_exception(error)
            self._finished.set_exception(error)
        else:
            self._finished.set_result(True)

    def _cancel_and_drain(self, primary: BaseException) -> None:
        assert self._runner is not None
        self._runner.cancel()
        # A cancelled portal Future is already done, but owned cleanup may still
        # be running. Wait for the independent completion before closing HTTP.
        while not self._finished.done():
            try:
                wait([self._finished])
            except (KeyboardInterrupt, SystemExit):
                continue
        secondary = self._finished.exception()
        if (
            secondary is not None
            and secondary is not primary
            and not isinstance(secondary, asyncio.CancelledError)
        ):
            raise BaseExceptionGroup(
                "Synchronous context interrupted and asynchronous exit failed",
                [primary, secondary],
            ) from None

    def __enter__(self) -> T:
        self._runner = self._portal.start_task_soon(self._run)
        try:
            return self._entered.result()
        except BaseException as primary:
            self._cancel_and_drain(primary)
            raise

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        self._exception, self._traceback = exc, traceback
        try:
            self._portal.call(self._exit_event.set)
            return self._finished.result()
        except BaseException as primary:
            self._cancel_and_drain(primary)
            raise


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
                self._manager = start_blocking_portal()
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
        return _PortalContext(self._open(), context)

    def close(self, close_http: Callable[[], Awaitable[None]]) -> None:
        if self._closed:
            return
        try:
            self.call(close_http)
        finally:
            self._closed = True
            if self._manager is not None:
                self._manager.__exit__(None, None, None)
