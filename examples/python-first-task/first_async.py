import asyncio
import os

from deepagents import create_deep_agent
from first_model import model
from harakiri import AsyncHarakiriClient
from harakiri_deepagents import AsyncHarakiriSandboxBackend


async def main() -> None:
    prompt = 'Write hello.sh that prints "Hello from Deep Agents". Run it with bash.'
    async with AsyncHarakiriClient.from_env() as client:
        async with client.sandboxes.task(template=os.environ["HARAKIRI_TEMPLATE"]) as sandbox:
            backend = AsyncHarakiriSandboxBackend(sandbox)
            agent = create_deep_agent(model=model, backend=backend)
            result = await agent.ainvoke(
                {"messages": [{"role": "user", "content": prompt}]},
                {"recursion_limit": 12},
            )
            print(result["messages"][-1].text)


if __name__ == "__main__":
    asyncio.run(main())
