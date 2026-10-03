"""Build once, then test wheel and sdist consumers outside the repository."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str], *, cwd: Path, env: dict[str, str]) -> None:
    subprocess.run(args, cwd=cwd, env=env, check=True, timeout=300)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist-dir", type=Path, default=ROOT / "dist-packages/python")
    parser.add_argument("--no-build", action="store_true")
    parser.add_argument("--python", default="3.12")
    options = parser.parse_args()
    distribution = options.dist_dir.resolve()
    distribution.mkdir(parents=True, exist_ok=True)
    env = {
        key: value
        for key, value in os.environ.items()
        if key
        in {
            "PATH",
            "HOME",
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "SYSTEMROOT",
            "SYSTEMDRIVE",
            "TEMP",
            "TMP",
            "SSL_CERT_FILE",
        }
    }
    env.update(UV_NO_CONFIG="1", PYTHONNOUSERSITE="1", LANGSMITH_TRACING="false")
    if not options.no_build:
        for name in ("python-sdk", "python-deepagents"):
            run(
                ["uv", "build", str(ROOT / "packages" / name), "--out-dir", str(distribution)],
                cwd=ROOT,
                env=env,
            )
    evidence: dict[str, object] = {
        "kind": "python-installed-packages",
        "published": False,
        "artifacts": {},
    }
    artifacts = {}
    for pattern in ("*.whl", "*.tar.gz"):
        files = sorted(distribution.glob(pattern))
        if len(files) != 2:
            raise RuntimeError("Expected exactly one core and one adapter artifact for each format")
        core = next(file for file in files if file.name.startswith("h_sandbox-"))
        adapter = next(file for file in files if file.name.startswith("h_sandbox_deepagents-"))
        with tempfile.TemporaryDirectory(prefix="harakiri-python-consumer-") as directory:
            consumer = Path(directory)
            venv = consumer / "venv"
            python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
            run(["uv", "venv", "--python", options.python, str(venv)], cwd=consumer, env=env)
            run(
                [
                    "uv",
                    "pip",
                    "install",
                    "--python",
                    str(python),
                    "--index-url",
                    "https://pypi.org/simple",
                    str(core),
                ],
                cwd=consumer,
                env=env,
            )
            run(
                [
                    str(python),
                    "-I",
                    "-c",
                    (
                        "import sys, pathlib, importlib.metadata as m; import harakiri; "
                        "assert 'deepagents' not in sys.modules; "
                        "assert pathlib.Path(harakiri.__file__).parent"
                        ".joinpath('py.typed').is_file(); "
                        "assert m.version('h-sandbox') == harakiri.__version__; "
                        "assert 'site-packages' in harakiri.__file__; "
                        "print('Core consumer: passed')"
                    ),
                ],
                cwd=consumer,
                env=env,
            )
            run([str(python), str(ROOT / "python" / "memory_artifact.py")], cwd=consumer, env=env)
            run(
                [
                    "uv",
                    "pip",
                    "install",
                    "--python",
                    str(python),
                    "--index-url",
                    "https://pypi.org/simple",
                    str(adapter),
                ],
                cwd=consumer,
                env=env,
            )
            run(
                [
                    str(python),
                    "-I",
                    "-c",
                    (
                        "import inspect, importlib.metadata as m; "
                        "from harakiri_deepagents import "
                        "HarakiriSandboxBackend, AsyncHarakiriSandboxBackend, "
                        "HarakiriExecutionInterruptedError; "
                        "assert m.version('deepagents') == '0.7.21'; "
                        "assert not inspect.isabstract(HarakiriSandboxBackend); "
                        "assert not inspect.isabstract(AsyncHarakiriSandboxBackend); "
                        "assert issubclass(HarakiriExecutionInterruptedError, KeyboardInterrupt); "
                        "assert not issubclass(HarakiriExecutionInterruptedError, Exception); "
                        "print('Adapter consumer: passed')"
                    ),
                ],
                cwd=consumer,
                env=env,
            )
        artifacts.update(
            {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in files}
        )
    evidence["artifacts"] = artifacts
    evidence["status"] = "passed"
    (distribution / "package-receipt.json").write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    main()
