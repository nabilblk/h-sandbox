# Harakiri UI Product Tour

A real, full-frame dashboard workflow. 5:34 at 1920x1080. Silent video with optional English captions and a synchronized written guide.

Recorded 2026-09-09 using a local source preview connected to the live Harakiri API. The source revision and file hashes are in provenance.json. This is a tested lab workflow, not a claim that every provider or installation supports identical runtime capabilities.

The small synthetic project uses Node 20, persistent storage and outbound policy enforcement. No model call or customer project is involved. Files were uploaded through the Harakiri API between the terminal and file-browser chapters. Provisioning and release waits between chapters are omitted; all recorded interactions remain at normal speed.

## 0:00 - One project, one control plane

Harakiri is a self-hosted sandbox control plane for agent applications. This is the real dashboard, at normal browser zoom. Follow a release-check project from environment selection to verified cleanup. The example is deterministic: no model account or AI-generated output is needed.

**Observed outcome:** The full application navigation and sandbox inventory remain visible.

## 0:12 - Choose the environment

Templates describe the environment your work runs in. Compare CPU, memory, visibility and readiness before launching. This project uses Node 20, with one CPU and 1 GiB of memory. Other agent-specific examples live in the demo library; this tour focuses on the control plane itself.

**Observed outcome:** A ready Node 20 template is selected, without building a new image.

## 0:30 - Give the project durable storage

A workspace is persistent project storage, not another running sandbox. Create release-checks once. Its files will be mounted at /workspace when a sandbox attaches. This installation allocates 1 GiB; storage size and availability depend on the operator configuration.

**Observed outcome:** The new workspace is Available, with no runtime attached.

## 0:48 - Launch with explicit limits

Create a sandbox from the workspace. Choose Node 20, name the runtime release-checks-01, and set a 30-minute lifetime for recording. Resources come from the template. Internet access starts enabled. Provisioning may take longer than shown: only waiting between chapters is removed.

**Observed outcome:** The sandbox is created with the selected template and workspace.

## 1:10 - Connect to the real runtime

The sandbox detail view keeps status, lifetime, template and workspace together. Terminal connects through Harakiri. Run pwd and node --version to inspect the actual environment. Commands and outputs in this film are executed, not reconstructed. There is no Kubernetes exec fallback.

**Observed outcome:** The terminal responds with the working directory and installed Node version.

## 1:28 - Prepare the connectivity tools

The example files were uploaded through the file API between chapters. This minimal Node image needs curl and certificate roots for the built-in access test. Run the included prepare-tools.sh through Commands while Internet access is enabled. Package output is retained in /tmp/tour-packages.log. A prepared team template can include these tools already.

**Observed outcome:** curl and trusted certificate roots are installed in this disposable runtime.

## 1:52 - Inspect the project files

The four small example files are included with this tour. Filesystem shows the runtime directory listing, sizes and paths. Open /workspace to inspect the project. This view is a browser, not an in-browser code editor. The release check will create a report alongside these files.

**Observed outcome:** README.md, check.mjs and server.mjs are visible in /workspace.

## 2:08 - Run work with retained output

Use Commands for tracked work. Set the working directory explicitly and run node check.mjs. The script validates three release checks and writes report.json. Output arrives while the command runs, and the exit code makes completion explicit. This is a deterministic test fixture, not an agent benchmark.

**Observed outcome:** Three checks pass, report.json is written, and the command exits with code 0.

## 2:36 - Return to the same command

Move to Filesystem to see the new report, then return to Commands and select the same run. Its output can be followed again without starting duplicate work. Command history belongs to the runtime; it is not a promise of permanent log retention after that runtime is deleted.

**Observed outcome:** The existing command output is replayed; the command is not rerun.

## 2:52 - Start a preview service

Start node server.mjs from Commands. It serves the report on port 3000 and binds to all sandbox interfaces. The process continues when you move to another tab. The UI gives tracked commands a five-minute command timeout, so this preview is deliberately short-lived.

**Observed outcome:** The service reports that port 3000 is ready.

## 3:10 - Share a running result

In Network, expose port 3000 as a Public route and open the resulting URL. This example contains only synthetic release-check results. Public means anyone with the URL can visit it; use Token access for a protected service. The preview below is the actual running server, not a screenshot mockup.

**Observed outcome:** The live preview returns the report containing three passing checks.

## 3:30 - Control outbound access

Inbound previews and outbound policy solve different problems. Select the Node packages preset. The package registry is reachable; example.com is not after the restriction. The capture verified that example.com was reachable before the change. Counters represent rules, not traffic totals. These tests execute inside the sandbox.

**Observed outcome:** The permitted registry is reachable. The previously reachable, unlisted site is now blocked or unreachable.

## 3:58 - Inspect runtime activity

Logs and Metrics keep runtime diagnostics near the work. Inspect lifecycle entries, then the current CPU and memory snapshot. These are operational observations, not historical billing data or an agent-reasoning trace. Provider capabilities determine which additional runtime measurements are available.

**Observed outcome:** Real lifecycle logs and a CPU/memory snapshot are returned.

## 4:16 - End compute, keep the project

Kill terminates this sandbox and its preview route. It does not erase a persistent workspace. Wait for the workspace to finish releasing before reusing it. The next chapter begins after that release has completed; no concurrent writer or instant handoff is implied.

**Observed outcome:** The first runtime is terminated and its workspace becomes Available.

## 4:30 - Start a replacement runtime

Return to Workspaces and create release-checks-02 from the same storage. Choose Node 20 again. This is a new sandbox, not a resumed process or a VM snapshot. The project files are retained; processes, open connections and command history are not carried over.

**Observed outcome:** A different sandbox attaches to the original workspace.

## 4:52 - Prove the files survived

In the replacement sandbox, run the report verification command from /workspace. It reads the existing report.json and verifies that all three checks passed. The capture also compares the report bytes across both runtimes. Nothing regenerates the report during this verification.

**Observed outcome:** The retained report passes verification in a new runtime, with identical contents.

## 5:14 - Finish with visible cleanup

Terminate the replacement runtime and archive the workspace. The archive dialog explicitly retains its files and storage allocation; physical deletion is an operator action. Both runtimes and the preview are now inactive. Continue with the CLI, SDK and OpenCode demos for real agent workflows on the same control plane.

**Observed outcome:** No tour runtime is running. The workspace is archived with files retained.

## Reproduce

Download example-source.zip for README.md, check.mjs, server.mjs and prepare-tools.sh. The public documentation page at https://sb.harakiri.io/#docs/ui-product-tour contains the complete walkthrough and verification command.

## Recording boundaries

The film is the entire application viewport, not browser chrome. No panel crops, zooms, time acceleration, fabricated output or paid model calls. Small pointer rings replay actual input positions. No voiceover is present. Native captions are optional because they overlay video; the synchronized guide sits outside the image.

Both tour runtimes were terminated and the route made inactive. The workspace was archived, not physically deleted. The temporary capture API key was revoked.
