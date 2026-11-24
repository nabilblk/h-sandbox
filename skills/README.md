# Agent Skills

Skills that teach coding agents (Claude Code, Codex, Cursor and other tools
that read `SKILL.md`) to deploy and use Harakiri Sandbox safely.

| Skill | For | What the agent does |
| --- | --- | --- |
| [harakiri-deploy](harakiri-deploy/SKILL.md) | Operators | Picks local, Kubernetes, OpenShift or disconnected installation. Pins one release, runs read-only preflight, asks before changing a cluster and finishes with a checked first sandbox. |
| [harakiri-sandbox](harakiri-sandbox/SKILL.md) | Developers | Runs code, tests and dev servers in sandboxes through the `harakiri` CLI. Moves files, adds token-protected previews and restricted egress, and cleans up what it created. |

The deploy skill keeps environment detail in
[references](harakiri-deploy/references/), and the agent loads only the
target's file. Exact commands and versions stay in the release-tagged guides
([Kubernetes](../docs/install-kubernetes.md), [OpenShift](../docs/install-openshift.md),
[air-gap](../docs/airgap.md)). The skills point to them rather than copying
them, so they don't drift between releases.

## Install

With the [`skills` CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add nabilblk/h-sandbox --skill harakiri-sandbox
npx skills add nabilblk/h-sandbox --skill harakiri-deploy
```

Or copy a folder into your agent's skills directory. For Claude Code, use
`~/.claude/skills/` for all projects, or `.claude/skills/` for one project:

```bash
git clone --depth 1 https://github.com/nabilblk/h-sandbox.git /tmp/h-sandbox
cp -R /tmp/h-sandbox/skills/harakiri-sandbox ~/.claude/skills/
```

Then ask in plain language, for example "run the test suite in a Harakiri
sandbox", or "install Harakiri on my k0s cluster".

## Boundaries

Skills guide an agent. They do not grant permissions or replace review.

- **Deployment.** The deploy skill asks before every cluster mutation and never
  changes OpenShift SCCs.
- **Sandbox use.** The sandbox skill touches only resources it created in the
  session.
- **Credentials.** Both skills keep credentials out of the conversation.
  Users set `HARAKIRI_API_KEY` in their own shell.

Harakiri is a Developer Preview for trusted teams. See the
[preview scope](../docs/developer-preview.md).

## Contributing

Edit a skill when the product contract changes. `node --test scripts/agent-skills.test.mjs`
checks:

- the frontmatter;
- that relative links resolve;
- that no skill hardcodes a release-candidate version;
- that every CLI subcommand a skill uses still exists.
