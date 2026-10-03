import json
import os
import signal
import time
from pathlib import Path

from langchain_ollama import ChatOllama
from repair import repair

assert os.environ.get("HARAKIRI_PYTHON_ACCEPTANCE") == "disposable-runner"
budget_expired = False


def expire_budget(signum, frame):
    global budget_expired
    budget_expired = True
    raise TimeoutError("The isolated model workflow exceeded its execution budget")


model = ChatOllama(
    model="qwen3:4b-instruct",
    base_url="http://127.0.0.1:11434",
    temperature=0,
    seed=0,
    num_ctx=8192,
    num_predict=1024,
    client_kwargs={"timeout": 180},
)
started = time.monotonic()
# This Linux-only harness budget leaves time for the SDK's independent cleanup.
signal.signal(signal.SIGALRM, expire_budget)
signal.alarm(720)
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
            {
                "gate": "real-model-repair",
                "type": type(error).__name__,
                "phase": "model_budget_exceeded" if budget_expired else "model_execution_failed",
                "elapsedSeconds": round(time.monotonic() - started),
                "budgetSeconds": 720,
                "frames": frames[-4:],
            }
        )
    )
    raise
finally:
    signal.alarm(0)
