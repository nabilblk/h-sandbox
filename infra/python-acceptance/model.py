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
try:
    Path("model-result.json").write_text(json.dumps(repair(model, Path("verified-repair"))))
except BaseException as error:
    frames = []
    traceback = error.__traceback__
    while traceback:
        frames.append({"function": traceback.tb_frame.f_code.co_name, "line": traceback.tb_lineno})
        traceback = traceback.tb_next
    Path("native-failure.json").write_text(
        json.dumps(
            {"gate": "real-model-repair", "type": type(error).__name__, "frames": frames[-4:]}
        )
    )
    raise
