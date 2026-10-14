import os

from deepagents import create_deep_agent
from first_model import model
from harakiri import HarakiriClient
from harakiri_deepagents import HarakiriSandboxBackend

with HarakiriClient.from_env() as client:
    sandbox = client.sandboxes.connect(os.environ["HARAKIRI_SANDBOX_ID"])
    sandbox.wait_ready()
    backend = HarakiriSandboxBackend(sandbox)
    agent = create_deep_agent(model=model, backend=backend)
    result = agent.invoke({"messages": [{"role": "user", "content": "Run pwd."}]})
    print(result["messages"][-1].text)
# Closing this client does not terminate the borrowed sandbox.
