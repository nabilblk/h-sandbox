# CLI to a live sandbox

Real Harakiri CLI and dashboard capture. Waiting time is edited; no benchmark claims. Silent by design.

## 00:00 - Harakiri Sandbox

From the CLI to a live application, then back to a clean workspace.

## 00:04 - Start with a template.

Configure the published CLI and create an open-agents-dev sandbox with a five-minute TTL.

## 00:13 - A real shell. Your workspace.

Attach through Harakiri. Inspect the uploaded application in /workspace.

## 00:21 - Run your application.

Upload the files and start a tracked background command on port 3000.

## 00:28 - One command to a live URL.

Expose port 3000 and wait for the application health endpoint to return HTTP 200.

## 00:36 - Your code, served from the sandbox.

The public route returns the application and the identifier of this capture run.

## 00:40 - The same sandbox in your browser.

The dashboard terminal connects to the same running sandbox.

## 00:44 - Inspect the actual files.

The Filesystem view shows the server, page, and logo uploaded through the CLI.

## 00:48 - Follow the lifecycle.

Logs display real control-plane lifecycle events with their source labels.

## 00:52 - See the runtime state.

Metrics show the provider CPU and memory snapshot. This is not a performance benchmark.

## 00:56 - Keep routes in view.

The Network view lists the exposed application port.

## 01:00 - Done means cleaned up.

Terminate the sandbox. This run verified a terminal state and that the public route was no longer active.
