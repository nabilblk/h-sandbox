from __future__ import annotations

import asyncio
from unittest.mock import Mock

import pytest
from deepagents import create_deep_agent
from harakiri import CommandReference
from harakiri.errors import AuthorizationError
from harakiri_deepagents import (
    AsyncHarakiriSandboxBackend,
    HarakiriExecutionCancelledError,
    HarakiriExecutionError,
    HarakiriSandboxBackend,
    HarakiriTransferCancelledError,
    HarakiriTransferError,
)
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import Field


class ScriptedModel(BaseChatModel):
    """Real framework dispatch, deterministic model fixture; never claimed as an LLM test."""

    tool_name: str = "execute"
    arguments: dict = Field(default_factory=lambda: {"command": "printf test"})

    @property
    def _llm_type(self):
        return "harakiri-contract-fixture"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        message = (
            AIMessage(content="Finished")
            if any(isinstance(m, ToolMessage) for m in messages)
            else AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": self.tool_name,
                        "args": self.arguments,
                        "id": "call_test",
                        "type": "tool_call",
                    }
                ],
            )
        )
        return ChatResult(generations=[ChatGeneration(message=message)])


@pytest.mark.parametrize("reason", ["timeout", "killed", "error", "unknown"])
def test_real_framework_sees_abnormal_termination(sandbox, observed, reason):
    sandbox.processes.start.return_value.observe.return_value = observed(
        exit_code=None, finish_reason=reason
    )
    backend = HarakiriSandboxBackend(sandbox)
    agent = create_deep_agent(model=ScriptedModel(), backend=backend)
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Run the task"}]}, {"recursion_limit": 8}
    )
    output = next(
        message.content for message in result["messages"] if isinstance(message, ToolMessage)
    )
    assert any(word in output for word in ("timed out", "killed", "runtime error", "unconfirmed"))
    assert sandbox.processes.start.call_count == 1


def test_grep_preserves_transport_clipping_without_partial_match(sandbox, observed):
    process = sandbox.processes.start.return_value
    process.observe.return_value = observed(
        output="/workspace/a\x001:complete\n/workspace/a\x002:tor", truncated=True
    )
    result = HarakiriSandboxBackend(sandbox).grep("needle")
    assert result.truncated
    assert result.matches == [{"path": "/workspace/a", "line": 1, "text": "complete"}]


def test_read_and_listing_do_not_disguise_truncated_payloads(sandbox, observed):
    sandbox.processes.start.return_value.observe.return_value = observed(
        output="[]", truncated=True
    )
    backend = HarakiriSandboxBackend(sandbox)
    assert "truncated" in backend.ls("/workspace").error
    assert "truncated" in backend.read("/workspace/a").error


def test_persistence_callback_error_retains_command_reference(sandbox):
    callback = Mock(side_effect=OSError("checkpoint unavailable"))
    backend = HarakiriSandboxBackend(sandbox, on_command_started=callback)
    with pytest.raises(HarakiriExecutionError) as error:
        backend.execute("side effects")
    assert error.value.stage == "acknowledgement"
    assert error.value.reference.command_id == "cmd_test"
    assert isinstance(error.value.__cause__, OSError)
    sandbox.processes.start.return_value.observe.assert_not_called()


def test_observation_never_restarts_command(sandbox):
    backend = HarakiriSandboxBackend(sandbox)
    reference = CommandReference(sandbox_id="sbx_test", command_id="cmd_test")
    backend.observe(reference)
    sandbox.processes.start.assert_not_called()
    with pytest.raises(ValueError):
        backend.observe(CommandReference(sandbox_id="other", command_id="cmd_test"))


def test_transfer_failure_keeps_completed_paths_and_authorization(sandbox):
    sandbox.files.write.side_effect = [None, AuthorizationError(403, "forbidden")]
    with pytest.raises(HarakiriTransferError) as error:
        HarakiriSandboxBackend(sandbox).upload_files([("a", b"1"), ("b", b"2")])
    assert error.value.completed_paths == ("a",)
    assert isinstance(error.value.__cause__, AuthorizationError)


@pytest.mark.asyncio
@pytest.mark.parametrize("download", [False, True])
async def test_between_file_cancellation_retains_partial_transfer(async_sandbox, download):
    current = asyncio.current_task()

    async def complete(*args, **kwargs):
        current.cancel()
        return b"hello" if download else None

    if download:
        async_sandbox.files.read_bytes.side_effect = complete
    else:
        async_sandbox.files.write.side_effect = complete
    backend = AsyncHarakiriSandboxBackend(async_sandbox)
    with pytest.raises(HarakiriTransferCancelledError) as error:
        if download:
            await backend.adownload_files(["a", "b"])
        else:
            await backend.aupload_files([("a", b"1"), ("b", b"2")])
    assert isinstance(error.value, asyncio.CancelledError)
    assert error.value.completed_paths == ("a",)
    assert error.value.path == "b"


@pytest.mark.asyncio
async def test_native_async_framework_and_cancellation_reference(async_sandbox):
    backend = AsyncHarakiriSandboxBackend(async_sandbox)
    agent = create_deep_agent(model=ScriptedModel(), backend=backend)
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "Run the task"}]}, {"recursion_limit": 8}
    )
    assert any(isinstance(message, ToolMessage) for message in result["messages"])
    async_sandbox.processes.start.assert_awaited_once()
    async_sandbox.processes.start.return_value.observe.side_effect = asyncio.CancelledError()
    with pytest.raises(HarakiriExecutionCancelledError) as error:
        await backend.aexecute("work")
    assert error.value.reference.command_id == "cmd_test"


@pytest.mark.asyncio
async def test_async_inherited_files_use_async_primitives(async_sandbox, observed):
    backend = AsyncHarakiriSandboxBackend(async_sandbox)
    process = async_sandbox.processes.start.return_value
    process.observe.return_value = observed(output="/workspace/a\x001:ok\npartial", truncated=True)
    assert (await backend.agrep("needle")).truncated
    process.observe.return_value = observed(output="[]", truncated=True)
    assert "truncated" in (await backend.als("/workspace")).error
    assert "truncated" in (await backend.aread("/workspace/a")).error
    assert (await backend.awrite("/workspace/a", "text")).error is None
    assert (await backend.adelete("/workspace/a")).error is None
    async_sandbox.files.write.assert_awaited_once()
    async_sandbox.files.remove.assert_awaited_once()


def test_output_bound_and_multibyte_boundary(sandbox, observed):
    sandbox.processes.start.return_value.observe.return_value = observed(
        output="\u00e9\u00e9\u00e9"
    )
    result = HarakiriSandboxBackend(sandbox, max_output_bytes=3).execute("large output")
    assert result.output == "\u00e9"
    assert result.truncated
    assert result.exit_code == 0


def test_real_grep_tool_exposes_truncation(sandbox, observed):
    sandbox.processes.start.return_value.observe.return_value = observed(
        output="/workspace/a\x001:needle\n/workspace/a\x002:tor", truncated=True
    )
    agent = create_deep_agent(
        model=ScriptedModel(tool_name="grep", arguments={"pattern": "needle"}),
        backend=HarakiriSandboxBackend(sandbox),
    )
    result = agent.invoke({"messages": [("user", "Find needle")]}, {"recursion_limit": 8})
    output = next(
        message.text for message in result["messages"] if isinstance(message, ToolMessage)
    )
    assert "truncat" in output.lower() or "incomplete" in output.lower()
    assert "2:tor" not in output


def test_official_checkpoint_reopens_without_executing_approval(sandbox, tmp_path):
    config = {"configurable": {"thread_id": "owned-thread"}}
    database = str(tmp_path / "checkpoint.sqlite")
    with SqliteSaver.from_conn_string(database) as saver:
        agent = create_deep_agent(
            model=ScriptedModel(),
            backend=HarakiriSandboxBackend(sandbox),
            checkpointer=saver,
            interrupt_on={"execute": True},
        )
        result = agent.invoke({"messages": [("user", "Run a task")]}, config)
        assert result["__interrupt__"]
    sandbox.processes.start.assert_not_called()
    with SqliteSaver.from_conn_string(database) as saver:
        recovered = create_deep_agent(
            model=ScriptedModel(),
            backend=HarakiriSandboxBackend(sandbox),
            checkpointer=saver,
            interrupt_on={"execute": True},
        )
        assert recovered.get_state(config).next
    sandbox.processes.start.assert_not_called()
