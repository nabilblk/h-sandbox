"""A real Deep Agent repair, verified independently against the original tests."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from deepagents import create_deep_agent
from harakiri import HarakiriClient
from harakiri_deepagents import HarakiriSandboxBackend
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage

FIXTURE = Path(__file__).parent / "fixture"
PROMPT = (
    "Repair totals.py in the current working directory. Run python3 -m unittest -v first, "
    "then fix the implementation and rerun the tests. Do not modify test_totals.py. "
    "Use the execute tool to inspect and edit the files. Report the test result."
)


def repair(model: BaseChatModel, destination: Path) -> dict[str, object]:
    original_test = (FIXTURE / "test_totals.py").read_bytes()
    original_code = (FIXTURE / "totals.py").read_bytes()
    with HarakiriClient.from_env() as client:
        with client.sandboxes.task(
            template=os.environ["HARAKIRI_TEMPLATE"], ttl_seconds=900
        ) as sandbox:
            sandbox.files.write("totals.py", original_code)
            sandbox.files.write("test_totals.py", original_test)
            before = sandbox.run("python3 -m unittest -v", timeout=30)
            assert before.exit_code != 0 and "FAILED (failures=2)" in before.stderr
            agent = create_deep_agent(
                model=model,
                backend=HarakiriSandboxBackend(sandbox, timeout=60),
                system_prompt="Use shell tools to repair the code. Keep the original tests intact.",
            )
            result = agent.invoke(
                {"messages": [{"role": "user", "content": PROMPT}]},
                {"recursion_limit": 32},
            )
            patched = sandbox.files.read_bytes("totals.py")
            assert sandbox.files.read_bytes("test_totals.py") == original_test
            assert patched != original_code, "Agent did not change the implementation"
            # Re-upload our trusted test bytes before an independent, non-agent test run.
            sandbox.files.write("test_totals.py", original_test)
            after = sandbox.run("python3 -m unittest -v", timeout=30, check=True)
            assert "Ran 4 tests" in after.stderr and "OK" in after.stderr
            messages = result["messages"]
            calls = sum(isinstance(message, AIMessage) for message in messages)
            tools = sum(isinstance(message, ToolMessage) for message in messages)
            assert calls > 0 and tools > 0, "No model/tool workflow was observed"
            destination.mkdir(parents=True, exist_ok=True)
            (destination / "totals.py").write_bytes(patched)
    return {
        "status": "verified",
        "originalTestSha256": hashlib.sha256(original_test).hexdigest(),
        "patchSha256": hashlib.sha256(patched).hexdigest(),
        "originalTests": 4,
        "modelResponses": calls,
        "toolResponses": tools,
        "ownedCleanup": "confirmed",
    }


if __name__ == "__main__":
    model = init_chat_model(os.environ["HARAKIRI_AGENT_MODEL"])
    print(repair(model, Path("repair-output")))
