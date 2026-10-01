import os

from deepagents import create_deep_agent
from first_model import model
from harakiri import HarakiriClient
from harakiri_deepagents import HarakiriSandboxBackend

prompt = 'Write hello.sh that prints "Hello from Deep Agents". Run it with bash.'

with HarakiriClient.from_env() as client:
    with client.sandboxes.task(
        template=os.environ["HARAKIRI_TEMPLATE"],
    ) as sandbox:
        backend = HarakiriSandboxBackend(sandbox)
        agent = create_deep_agent(model=model, backend=backend)
        result = agent.invoke(
            {"messages": [("user", prompt)]},
            {"recursion_limit": 12},
        )
        print(result["messages"][-1].text)
