export const demoTutorialSections = [
  {
    title: "Prepare your workspace",
    text: "Use a deployed Harakiri API, a workspace API key, and a ready open-agents-dev template. Run these commands in Bash from a checkout of the h-sandbox repository. The example uses only Node's standard library; it makes no model or package-registry calls while running.",
    code: `npm install -g @h-sandbox/cli@0.4.0
export HARAKIRI_API_URL="https://your-api.example.com"
read -r -s -p "Workspace API key: " HARAKIRI_API_KEY
printf '\\n'
export HARAKIRI_API_KEY
harakiri login --api-url "$HARAKIRI_API_URL"
harakiri --version
harakiri template inspect open-agents-dev`,
    check: "The CLI reports 0.4.0 and the template is ready. Login stores a local CLI configuration; do not record or publish it. If the template is absent, build examples/templates/open-agents-dev using the template build tutorial first.",
  },
  {
    title: "Create and upload",
    text: "Give the sandbox a short TTL and install a cleanup trap immediately. The printed identifier belongs to your run: do not reuse the ID or route from the video.",
    code: `set -euo pipefail
SBX_ID="$(harakiri create --template open-agents-dev --name product-tour --ttl 300 | sed -n '/^sbx_/p')"
test -n "$SBX_ID"
cleanup() { harakiri kill "$SBX_ID"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for file in server.mjs index.html mark.svg; do
  harakiri file-upload "$SBX_ID" \\
    --from "examples/demo/product-tour/$file" \\
    --path "/workspace/$file" --parents
done`,
    check: "Creation prints an sbx_ identifier. Each upload reports a file size, checksum, and /workspace path. Keep this Bash session open until cleanup.",
  },
  {
    title: "Connect to the shell",
    text: "Attach uses Harakiri's public terminal transport. It does not require kubectl, cluster credentials, or direct OpenSandbox access. The current provider launches Bash; omit shell and per-attach environment overrides.",
    code: `harakiri attach "$SBX_ID" --cwd /workspace
# In the attached shell:
pwd
ls -1
node --version
exit`,
    check: "Output includes /workspace, server.mjs, index.html, mark.svg, and the template's Node version. Exiting attach disconnects the shell; it does not terminate the sandbox.",
  },
  {
    title: "Start and expose the application",
    text: "The server binds to 0.0.0.0:3000. A detached command keeps it running after the CLI returns. This tutorial intentionally creates a public preview: anyone with the URL can visit it. Use token-protected routes for private content.",
    code: `harakiri command run "$SBX_ID" --cwd /workspace \\
  --cmd "node server.mjs" --detached
harakiri expose "$SBX_ID" --port 3000 \\
  --wait --wait-path /health --expect-status 200
harakiri routes "$SBX_ID"`,
    check: "The command reports a cmd_ identifier with running state. Expose waits for HTTP 200 and prints a deployment-specific HTTPS URL. Open it: the page shows Application running. The /health endpoint returns JSON with status: ok. Readiness is application-response evidence, not a latency benchmark.",
  },
  {
    title: "Inspect the same sandbox in the dashboard",
    text: "Sign in to the same workspace and open the matching sbx_ ID. In Terminal, run pwd and ls -1. Filesystem shows the uploaded files. Logs include the creation lifecycle event and source. Metrics show provider CPU/memory snapshots; unavailable disk or network readings are not measured values. Network lists the port 3000 route.",
    check: "The CLI and UI refer to one sandbox. Template versions, command IDs, dates, metrics, and URLs will differ from the recorded demo.",
  },
  {
    title: "Terminate and verify cleanup",
    text: "Terminate explicitly instead of waiting for TTL. The capture automation also checks cleanup after failures and signals.",
    code: `harakiri kill "$SBX_ID"
harakiri list
harakiri routes "$SBX_ID"
trap - EXIT INT TERM`,
    check: "The sandbox is terminated and its route is no longer ready. Refresh the old URL: it must no longer return the application. Older CLI wording about disk zeroing is not a provider guarantee; the demonstration makes no such claim.",
  },
  {
    title: "Troubleshooting",
    text: "A missing template belongs to another workspace or has not been built. Pending creation needs capacity/image-pull checks. Check attach errors against runtime capabilities. A route timeout commonly means the process exited or bound only to localhost. A dashboard 401 requires normal Keycloak sign-in in the correct organization. If cleanup fails, retry harakiri kill and ask the operator to inspect reconciliation; do not assume TTL already removed it.",
    check: "No provider-specific escape hatch is required. Capture maintainers should use the demo production runbook for recording, verification, and media refresh.",
  },
];
