import os

from harakiri import HarakiriClient
from harakiri.telemetry import agent_run, create_run_telemetry, observe_recorded_process

with HarakiriClient.from_env() as client:
    sandbox = client.sandboxes.connect(os.environ["HARAKIRI_SANDBOX_ID"])
    sandbox.wait_ready(timeout=60)
    with agent_run(
        client,
        "First recorded command",
        sandbox.id,
        capture="metadata",
        runtime=create_run_telemetry,
        ownership="owned",
        on_diagnostic=lambda code: print(f"Telemetry: {code}"),
    ) as recording:
        print(f"Run: {recording.run.id}")
        command = sandbox.processes.start("printf 'Hello from Harakiri\\n'", timeout=10)
        print(f"Command: {command.id}")
        result = observe_recorded_process(command, recording.runtime, timeout=30)
        if result.command.status != "succeeded" or result.command.exit_code != 0:
            raise RuntimeError(f"Command {command.id} did not succeed")

# connect() borrows the sandbox. Closing the recording does not delete it.
