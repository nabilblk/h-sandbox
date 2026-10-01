import json
from pathlib import Path

from langchain_ollama import ChatOllama
from repair import repair

model = ChatOllama(
    model="qwen3:4b-instruct",
    base_url="http://127.0.0.1:11434",
    temperature=0,
    num_ctx=8192,
    num_predict=2048,
    client_kwargs={"timeout": 180},
)
Path("model-result.json").write_text(json.dumps(repair(model, Path("verified-repair"))))
