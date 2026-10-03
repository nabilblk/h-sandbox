from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from harakiri import AsyncSandbox, CommandReference, Sandbox
from harakiri.models import CommandLogs, CommandSummary, ObservedCommand


def observation(*, output="done\n", exit_code=0, finish_reason="exit", truncated=False):
    return ObservedCommand(
        command=CommandSummary(
            id="cmd_test",
            sandbox_id="sbx_test",
            status="succeeded",
            exit_code=exit_code,
            finish_reason=finish_reason,
        ),
        logs=CommandLogs(
            command_id="cmd_test", stdout=output, stderr="", stdout_truncated=truncated
        ),
    )


def make_sandbox(async_mode=False):
    sandbox = Mock(spec=AsyncSandbox if async_mode else Sandbox)
    sandbox.id, sandbox.workdir = "sbx_test", "/workspace"
    sandbox.summary = SimpleNamespace(
        runtime_metadata=SimpleNamespace(limits=SimpleNamespace(command_timeout_ms=60000))
    )
    process = Mock()
    process.reference = CommandReference(sandbox_id="sbx_test", command_id="cmd_test")
    method = AsyncMock if async_mode else Mock
    process.observe = method(return_value=observation())
    sandbox.processes = SimpleNamespace(
        start=method(return_value=process), connect=method(return_value=process)
    )
    sandbox.files = SimpleNamespace(
        write=method(),
        read_bytes=method(return_value=b"hello"),
        stat=method(return_value=SimpleNamespace(type="file", size=5)),
        remove=method(),
    )
    return sandbox


@pytest.fixture
def sandbox():
    return make_sandbox()


@pytest.fixture
def async_sandbox():
    return make_sandbox(True)


@pytest.fixture
def observed():
    return observation


@pytest.fixture(autouse=True)
def no_tracing(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")
