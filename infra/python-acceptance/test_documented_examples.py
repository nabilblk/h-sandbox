import httpx
import pytest
from deepagents.backends import FilesystemBackend
from documented_examples import GREETING, MODEL, SCRIPT, ScriptedConversation, main, model_endpoint
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, ToolMessage

TOOLS = [
    {"type": "function", "function": {"name": name, "parameters": {"type": "object"}}}
    for name in ("write_file", "execute")
]


@pytest.mark.parametrize("existing", [False, True])
def test_scripted_endpoint_uses_the_documented_model_integration(existing):
    conversation = ScriptedConversation(workdir="/workspace", existing=existing)
    with model_endpoint(conversation) as endpoint:
        model = init_chat_model(f"ollama:{MODEL}", base_url=endpoint).bind_tools(TOOLS)
        messages = [HumanMessage(content="Run the documented task")]
        response = model.invoke(messages)
        if not existing:
            call = response.tool_calls[0]
            assert call["name"] == "write_file"
            assert call["args"] == {"file_path": "/workspace/hello.sh", "content": SCRIPT}
            messages.extend(
                [
                    response,
                    ToolMessage(
                        content="Updated file /workspace/hello.sh", tool_call_id=call["id"]
                    ),
                ]
            )
            response = model.invoke(messages)
        call = response.tool_calls[0]
        assert call["name"] == "execute"
        assert call["args"] == {"command": "pwd" if existing else "bash hello.sh"}
        output = "/workspace" if existing else GREETING
        messages.extend(
            [
                response,
                ToolMessage(
                    content=f"{output}\n[Command succeeded with exit code 0]",
                    tool_call_id=call["id"],
                ),
            ]
        )
        assert model.invoke(messages).text == output
        assert conversation.completed and conversation.failure is None


async def test_async_model_configuration_reaches_the_loopback_fixture():
    conversation = ScriptedConversation(workdir="/workspace", existing=True)
    with model_endpoint(conversation) as endpoint:
        model = init_chat_model(f"ollama:{MODEL}", base_url=endpoint).bind_tools(TOOLS)
        messages = [HumanMessage(content="Run pwd")]
        response = await model.ainvoke(messages)
        messages.extend(
            [
                response,
                ToolMessage(
                    content="/workspace\n[Command succeeded with exit code 0]",
                    tool_call_id=response.tool_calls[0]["id"],
                ),
            ]
        )
        assert (await model.ainvoke(messages)).text == "/workspace"
        assert conversation.completed


@pytest.mark.parametrize("content", ["/workspace", "/workspace\n[Command failed with exit code 1]"])
def test_non_successful_tool_output_cannot_pass(content):
    conversation = ScriptedConversation(workdir="/workspace", existing=True)
    request = {"model": MODEL, "tools": TOOLS, "messages": []}
    conversation.respond(request)
    request["messages"] = [{"role": "tool", "content": content}]
    with pytest.raises(AssertionError):
        conversation.respond(request)
    assert not conversation.completed


def test_fixture_rejects_unknown_requests_without_echoing_contents():
    conversation = ScriptedConversation(workdir="/workspace")
    with model_endpoint(conversation) as endpoint:
        response = httpx.post(f"{endpoint}/not-chat", json={"private": "not-for-logs"})
        assert response.status_code == 400
        assert "not-for-logs" not in response.text
    assert not conversation.completed


def test_program_execution_refuses_an_ambient_workstation(monkeypatch):
    monkeypatch.delenv("HARAKIRI_PYTHON_ACCEPTANCE", raising=False)
    with pytest.raises(AssertionError):
        main()


def test_local_file_tool_uses_the_virtual_root(tmp_path):
    conversation = ScriptedConversation(workdir=str(tmp_path), virtual_paths=True)
    response = conversation.respond({"model": MODEL, "tools": TOOLS, "messages": []})
    arguments = response["message"]["tool_calls"][0]["function"]["arguments"]
    assert arguments["file_path"] == "/hello.sh"
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    result = backend.write(**arguments)
    assert result.error is None
    assert (tmp_path / "hello.sh").read_text() == SCRIPT
