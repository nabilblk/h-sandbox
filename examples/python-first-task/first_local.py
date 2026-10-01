from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend
from first_model import model

root = Path("deepagents-local")
root.mkdir(exist_ok=True)
prompt = 'Write hello.sh that prints "Hello from Deep Agents". Run it with bash.'

# Local shell tools are not isolated.
backend = LocalShellBackend(
    root_dir=root,
    inherit_env=False,
)
agent = create_deep_agent(model=model, backend=backend)
result = agent.invoke(
    {"messages": [("user", prompt)]},
    {"recursion_limit": 12},
)
print(result["messages"][-1].text)
