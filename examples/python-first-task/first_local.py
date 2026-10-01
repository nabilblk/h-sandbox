from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend
from first_model import model

root = Path("deepagents-local")
root.mkdir(exist_ok=True)
prompt = 'Write hello.sh that prints "Hello from Deep Agents". Run it with bash.'

# Tools execute on the host. This is not an isolation boundary.
backend = LocalShellBackend(root_dir=root, inherit_env=False)
agent = create_deep_agent(model=model, backend=backend)
result = agent.invoke(
    {"messages": [{"role": "user", "content": prompt}]},
    {"recursion_limit": 12},
)
print(result["messages"][-1].text)
