"""Borrowed sandbox and official SQLite checkpointing for a single local worker."""

import os

from deepagents import create_deep_agent
from harakiri import HarakiriClient
from harakiri_deepagents import HarakiriSandboxBackend
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.sqlite import SqliteSaver

os.umask(0o077)
model = init_chat_model(os.environ["HARAKIRI_AGENT_MODEL"])
with HarakiriClient.from_env() as client, SqliteSaver.from_conn_string("approval.sqlite") as saver:
    sandbox = client.sandboxes.connect(os.environ["HARAKIRI_SANDBOX_ID"])
    sandbox.wait_ready()
    agent = create_deep_agent(
        model=model,
        backend=HarakiriSandboxBackend(sandbox),
        checkpointer=saver,
        interrupt_on={"execute": True},
    )
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Run printf 'approved work' using execute."}]},
        {"configurable": {"thread_id": "reviewed-local-example"}, "recursion_limit": 12},
    )
    assert result.get("__interrupt__"), "No approval pause was requested"
    print("Paused. Client closure does not kill the borrowed sandbox; TTL still applies.")
# A service must authorize the tenant/thread binding and review the pending tool
# before invoking Command(resume=...). Never automatically resume a lost worker.
