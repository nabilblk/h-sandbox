"""Generate discovery from the pinned upstream package without starting a server."""

import json
import os
import tempfile
from importlib.metadata import version
from pathlib import Path


def main():
    if version("open-terminal") != "0.14.6":
        raise RuntimeError("Use the pinned Open Terminal version")
    with tempfile.TemporaryDirectory(prefix="harakiri-schema-") as home:
        os.environ.clear()
        os.environ.update({
            "HOME": home, "OPEN_TERMINAL_API_KEY": "schema-generation-not-a-real-key",
            "OPEN_TERMINAL_ENABLE_NOTEBOOKS": "false", "OPEN_TERMINAL_ENABLE_SYSTEM_PROMPT": "false",
            "OPEN_TERMINAL_ENABLE_TERMINAL": "true", "OPEN_TERMINAL_MULTI_USER": "false",
            "SHELL": "/bin/bash",
        })
        from open_terminal.main import app

        schema = app.openapi()
        schema["info"]["description"] = "Open Terminal tools in a personal Harakiri sandbox."
        # Upstream embeds build-host metadata into this description. Discovery is
        # static; live cwd and execution results come from the authenticated runtime.
        schema["paths"]["/execute"]["post"]["description"] = (
            "Run a command in the remote Linux workspace. Python and Bash are installed. "
            "Returns a process ID; inspect its output before reporting completion."
        )
        path = Path(__file__).resolve().parents[1] / "open-terminal.openapi.json"
        path.write_text(json.dumps(schema, indent=2, ensure_ascii=True) + "\n")
        print(f"Generated Open Terminal {version('open-terminal')} discovery ({len(schema['paths'])} paths)")


if __name__ == "__main__":
    main()
