from __future__ import annotations

import math
from dataclasses import dataclass
from time import monotonic

from deepagents.backends.protocol import ExecuteResponse
from harakiri import CommandReference
from harakiri.models import ObservedCommand


def duration(value: float, name: str) -> float:
    if isinstance(value, bool) or not math.isfinite(value) or not 0 < value <= 2_147_483:
        raise ValueError(f"{name} must be positive, finite and at most 2147483 seconds")
    return value


@dataclass(frozen=True)
class ExecutionOptions:
    cwd: str
    timeout: float
    observation_timeout: float
    max_output_bytes: int = 65_536

    def __post_init__(self) -> None:
        if not self.cwd.startswith("/") or "\0" in self.cwd:
            raise ValueError("cwd must be an absolute POSIX path without NUL characters")
        duration(self.timeout, "timeout")
        duration(self.observation_timeout, "observation_timeout")
        if (
            isinstance(self.max_output_bytes, bool)
            or not isinstance(self.max_output_bytes, int)
            or not 1 <= self.max_output_bytes <= 1 << 20
        ):
            raise ValueError("max_output_bytes must be between 1 and 1048576")


@dataclass
class HarakiriExecuteResponse(ExecuteResponse):
    reference: CommandReference | None = None
    finish_reason: str | None = None

    @property
    def abnormal(self) -> bool:
        return self.exit_code is None or self.finish_reason not in {"exit", None}


def execution_result(observed: ObservedCommand, maximum: int) -> HarakiriExecuteResponse:
    command, logs = observed.command, observed.logs
    separator = "\n" if logs.stdout and logs.stderr and not logs.stdout.endswith("\n") else ""
    parts, remaining = [], maximum
    truncated = logs.stdout_truncated or logs.stderr_truncated
    for part in (logs.stdout, separator, logs.stderr):
        encoded = part.encode("utf-8")
        if len(encoded) > remaining:
            truncated = True
        chunk = encoded[:remaining].decode("utf-8", errors="ignore")
        remaining -= len(chunk.encode("utf-8"))
        parts.append(chunk)
    output = "".join(parts)
    notice = {
        "timeout": "Command timed out; execution did not complete normally.",
        "killed": "Command was killed; execution did not complete normally.",
        "error": "Command ended with a runtime error.",
    }.get(command.finish_reason or "")
    if notice is None and command.exit_code is None:
        notice = "Command ended without an exit code; normal completion is unconfirmed."
    if notice is None and command.finish_reason not in {"exit", None}:
        notice = "Command ended abnormally; normal completion is unconfirmed."
    if notice:
        output = f"[{notice}]\n{output}"
    return HarakiriExecuteResponse(
        output=output,
        exit_code=command.exit_code,
        truncated=truncated,
        reference=command.reference,
        finish_reason=command.finish_reason,
    )


class Budget:
    def __init__(self, seconds: float) -> None:
        self._end = monotonic() + duration(seconds, "observation_timeout")

    def remaining(self) -> float:
        remaining = self._end - monotonic()
        if remaining <= 0:
            raise TimeoutError(
                "Local observation budget expired; reconnect instead of resubmitting"
            )
        return remaining
