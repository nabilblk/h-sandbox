import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

const skills = "https://github.com/nabilblk/h-sandbox/tree/main/skills";

export const agentSkillCommands = {
  install: `npx skills add nabilblk/h-sandbox --skill harakiri-sandbox
npx skills add nabilblk/h-sandbox --skill harakiri-deploy`,
  copy: `git clone --depth 1 https://github.com/nabilblk/h-sandbox.git /tmp/h-sandbox
mkdir -p ~/.claude/skills
cp -R /tmp/h-sandbox/skills/harakiri-sandbox ~/.claude/skills/
cp -R /tmp/h-sandbox/skills/harakiri-deploy ~/.claude/skills/`,
  connect: `export HARAKIRI_API_URL=https://sandbox-api.example.com
# Set HARAKIRI_API_KEY yourself, from a scoped and expiring key.
# Never paste it into the agent conversation.
harakiri doctor`
};

export const agentSkillsDocs: DocPage = {
  id: "agent-skills", section: "Getting started", title: "Use Harakiri with AI coding agents", navTitle: "AI coding agents",
  lede: "Install two agent skills so a coding agent can deploy Harakiri on your infrastructure and run your code, tests and previews in isolated sandboxes.",
  toc: ["Choose a skill", "Install the skills", "Run work in sandboxes", "Deploy with an agent", "Boundaries"],
  body: <>
    <h2>Choose a skill</h2>
    <p>Skills are folders of instructions in the <code>SKILL.md</code> format. Claude Code, Codex, Cursor and similar coding agents load one when a request matches it. Harakiri publishes two skills in <a href={skills}>the repository</a>. Each one tells the agent how to use the existing CLI and the installation guides safely. They add no new API.</p>
    <table className="docs-data-table"><caption>Harakiri agent skills</caption><thead><tr><th scope="col">Skill</th><th scope="col">For</th><th scope="col">What the agent does</th></tr></thead><tbody>
      <tr><td><a href={`${skills}/harakiri-sandbox`}>harakiri-sandbox</a></td><td>Developers with an installation</td><td>Creates sandboxes and moves files in and out. Runs commands and background processes, opens token-protected previews and restricts outbound access. Cleans up what it created.</td></tr>
      <tr><td><a href={`${skills}/harakiri-deploy`}>harakiri-deploy</a></td><td>Operators</td><td>Detects a local, Kubernetes, OpenShift or disconnected target and pins one release. Runs read-only preflight, asks before changing a cluster and finishes with a checked first sandbox.</td></tr>
    </tbody></table>

    <h2>Install the skills</h2>
    <p>With the <a href="https://github.com/vercel-labs/skills">skills CLI</a>, install one or both:</p>
    <CodeBlock language="bash">{agentSkillCommands.install}</CodeBlock>
    <p>Or copy the folders into your agent's skills directory. For Claude Code, that is <code>~/.claude/skills/</code> for every project, or <code>.claude/skills/</code> for one project:</p>
    <CodeBlock language="bash">{agentSkillCommands.copy}</CodeBlock>

    <h2>Run work in sandboxes</h2>
    <p>Install the <a href="#docs/sdk-cli">CLI</a> at your server's version. Then connect it from your own shell, so the key never enters the agent conversation:</p>
    <CodeBlock language="bash">{agentSkillCommands.connect}</CodeBlock>
    <p>Then ask in plain language. For example: "run the test suite in a Harakiri sandbox", "try this untrusted script with outbound access blocked" or "start the dev server in a sandbox and give me a preview link".</p>
    <p>The skill makes the agent:</p>
    <ul>
      <li>terminate and remove only the sandboxes, commands and routes it created in the session;</li>
      <li>always pass an explicit sandbox ID;</li>
      <li>expose previews with token access, never public by default;</li>
      <li>exclude <code>.env</code> files and keys from uploads;</li>
      <li>use the <a href="#docs/credential-vault">Credential Vault</a> instead of environment variables for real credentials;</li>
      <li>prefer blocked or restricted <a href="#docs/outbound-access">outbound access</a> for code it has not reviewed;</li>
      <li>report capacity and unsupported-feature errors instead of working around them.</li>
    </ul>
    <p>Every installation serves its own version-matched documentation at <code>/llms.txt</code>. The skill reads it there, as well as <code>harakiri &lt;command&gt; --help</code>.</p>

    <h2>Deploy with an agent</h2>
    <p>Ask "install Harakiri on my cluster". The deploy skill works through these steps:</p>
    <ol>
      <li>Identify the target and stop if an OpenSandbox runtime is already installed.</li>
      <li>Pin one matching release, working from a clone at that release tag.</li>
      <li>Run read-only preflight checks.</li>
      <li>Present the exact commands and cluster-scoped objects, and wait for your approval.</li>
      <li>Install, then prove a real sandbox task works.</li>
      <li>Report which checks passed, which failed and which were not run.</li>
    </ol>
    <p>The skill does not copy commands or versions. It follows <a href="#docs/install-kubernetes">Install on Kubernetes</a>, <a href="#docs/install-openshift">Install on OpenShift</a> and the tagged release notes, which remain the source of truth.</p>
    <p>On OpenShift, it separates the platform administrator's prerequisites from namespace operations. Without cluster-scoped rights, it writes a handoff checklist for the administrator. It never changes SCCs, grants anyuid or privileged, or claims native qualification it has not observed.</p>

    <h2>Boundaries</h2>
    <aside className="docs-notice"><p><strong>Skills guide an agent; they do not grant permissions.</strong> The agent acts with your API key and your kubeconfig. Use a scoped, expiring key and an explicitly approved cluster context, and review each command before you approve a cluster change.</p><p>Harakiri is a <a href="#docs/developer-preview">Developer Preview</a> for trusted teams. A successful agent run qualifies only the exact version and profile it tested.</p></aside>
  </>
};
