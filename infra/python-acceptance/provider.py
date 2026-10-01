"""Provider fault phases orchestrated only by the guarded runner harness."""

import json
import os
import sys
from pathlib import Path

from harakiri import HarakiriClient
from harakiri.errors import HarakiriError

assert os.environ.get("HARAKIRI_PYTHON_ACCEPTANCE") == "disposable-runner"
state = Path("provider-runtime.json")
with HarakiriClient.from_env() as client:
    if sys.argv[1] == "prepare":
        sandbox = client.sandboxes.create(template=os.environ["HARAKIRI_TEMPLATE"], ttl_seconds=90)
        state.write_text(json.dumps({"sandbox_id": sandbox.id}))
    else:
        sandbox = client.sandboxes.connect(json.loads(state.read_text())["sandbox_id"])
        if sys.argv[1] == "unavailable":
            try:
                sandbox.kill(timeout=2)
            except HarakiriError:
                assert sandbox.refresh().capacity_phase != "released"
                assert client.capacity.get().in_use == 1
            else:
                raise AssertionError("Provider loss was disguised as confirmed cleanup")
        elif sys.argv[1] == "observe":
            sandbox.wait_terminated(timeout=240)
            assert sandbox.summary.capacity_phase == "released"
            assert client.capacity.get().in_use == 0
        else:
            raise ValueError("Unknown fault phase")
