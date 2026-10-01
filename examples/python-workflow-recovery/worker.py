"""Single-worker acknowledgement journal. Observation never replays the agent."""

from __future__ import annotations

import argparse
import os
import sqlite3
from pathlib import Path

from harakiri import CommandReference, HarakiriClient


def work(action: str, database: Path, sandbox_id: str | None) -> None:
    with sqlite3.connect(database) as journal, HarakiriClient.from_env() as client:
        journal.execute(
            "CREATE TABLE IF NOT EXISTS command ("
            "slot INTEGER PRIMARY KEY CHECK(slot = 1), sandbox_id TEXT NOT NULL, "
            "command_id TEXT, state TEXT NOT NULL)"
        )
        if action == "start":
            if not sandbox_id:
                raise ValueError("Pass --sandbox-id for an application-owned sandbox")
            sandbox = client.sandboxes.connect(sandbox_id)
            sandbox.wait_ready()
            # The unique intent is durable before submission. A missing acknowledgement
            # requires reconciliation, never an automatic second command.
            journal.execute("INSERT INTO command VALUES (1, ?, NULL, 'submitting')", (sandbox.id,))
            journal.commit()

            def acknowledge(reference: CommandReference) -> None:
                journal.execute(
                    "UPDATE command SET command_id = ?, state = 'acknowledged' WHERE slot = 1",
                    (reference.command_id,),
                )
                journal.commit()

            sandbox.processes.start(
                "sleep 3; printf 'completed\\n' >> recovery-marker.txt",
                timeout=30,
                on_started=acknowledge,
            )
        else:
            row = journal.execute(
                "SELECT sandbox_id, command_id, state FROM command WHERE slot = 1"
            ).fetchone()
            if not row or row[2] != "acknowledged" or not row[1]:
                raise RuntimeError("No acknowledged command. Reconcile manually; do not replay.")
            sandbox = client.sandboxes.connect(row[0])
            command = sandbox.processes.connect(row[1])
            observed = command.observe(timeout=60)
            if observed.command.exit_code != 0 or observed.command.finish_reason != "exit":
                raise RuntimeError("The existing command did not complete normally")
            assert sandbox.files.read_text("recovery-marker.txt") == "completed\n"
            print("Observed one completed command; no submission or graph invocation performed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "observe"])
    parser.add_argument("--database", type=Path, default=Path("workflow.sqlite"))
    parser.add_argument("--sandbox-id")
    args = parser.parse_args()
    os.umask(0o077)
    work(args.action, args.database, args.sandbox_id)
