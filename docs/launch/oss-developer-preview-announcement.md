# OSS Developer Preview Announcement Kit

September 9, 2026. **Draft for owner review. Nothing here has been posted.**
The owner authorized source opening; actual publication remains conditional on
the [launch safety checkpoint](../oss-launch-review.md). Do not publish the draft
below while the repository is private or present it as a production release.

## Recommendation

Use a staged technical launch, with GitHub as the canonical reference and
**LinkedIn as the first external announcement**. The intended first users are
platform engineers and developers integrating agent execution into products,
not people looking for a new chat application. A real task and a specific request
for integration feedback are more useful than an unsupported parity claim.

| Order | Channel | Form and purpose |
| --- | --- | --- |
| 1 | GitHub | Public repository, versioned prerelease, install guide, security policy and one maintainer announcement in Discussions after text approval |
| 2 | LinkedIn | A personal maintainer post of roughly 150-220 words with a captioned 60-90 second real workflow excerpt; link directly to the repository and docs |
| 3 | OpenSandbox community | A short technical introduction describing the control-plane boundary and inviting architecture/integration feedback; check the relevant category or ask moderators before posting |
| 4 | Show HN | A hands-on submission written by the owner, linking the usable project, with the owner available to answer technical questions |

These lengths and the sequence are recommendations, not platform requirements
or promises about ranking. Do not launch across every community simultaneously,
solicit votes, send bulk direct messages or invent testimonials. Defer Product
Hunt and paid promotion until the first installation feedback is resolved.

OpenSandbox has its own [Discussions](https://github.com/opensandbox-group/OpenSandbox/discussions)
and community links in its [repository](https://github.com/opensandbox-group/OpenSandbox).
Credit that runtime explicitly; Harakiri is not its replacement, an official
OpenSandbox release or an endorsed integration unless the upstream team says so.

## Announcement Draft

**Owner-review draft for LinkedIn or Harakiri's own GitHub Discussions, not HN.**
Publish only after anonymous source/release access and safety checks pass.

> I'm open-sourcing Harakiri Sandbox: a self-hosted control plane built on
> OpenSandbox for teams integrating agent execution into their own products.
>
> The focus is the developer experience around the runtime: create an environment,
> run a task, reconnect to its output, retrieve the result, and retain working files
> when the next task needs them. The TypeScript SDK, CLI and dashboard use the same
> control-plane API.
>
> Harakiri manages organizations, scoped API keys, templates, persistent workspaces
> and supported network policy. OpenSandbox handles execution. Your application
> still owns the agent, model selection and verification of its work.
>
> The demo shows OpenCode doing actual coding work, followed by independent tests
> of the result. A deterministic first task also works without any model account.
>
> This is an Apache-2.0 Developer Preview. We have a tested native Kubernetes/arm64
> path, published npm packages and Helm artifacts. It is not a managed service or
> a production-isolation guarantee; the documentation states the current limits,
> including restricted OpenShift and concurrency admission.
>
> I'd like feedback from developers and platform engineers: can you install it,
> complete a useful task, and integrate the SDK without a private patch?
>
> Source: https://github.com/nabilblk/h-sandbox
> Docs and demos: https://sb.harakiri.io/#docs

For a GitHub announcement, add the exact candidate, versioned installation and
delivery receipt links below. Do not say `npm latest` installs the preview.

## Demo Treatment

Reuse the [existing verified demos](https://sb.harakiri.io/#demos). A suggested
short excerpt, not a newly rendered or recorded video:

1. State one concrete task: repair a small program and verify it with tests.
2. Show the sandbox/template, CLI command and actual OpenCode work.
3. Show independently executed passing tests and the retrieved result.
4. Show cleanup, then finish on the source and documentation links.

Use readable terminal text and reviewed captions. Do not show keys, cookies,
private code or customer names. Identify edited waiting time; do not present
historical footage as a latency benchmark or free-model availability guarantee.
If workspaces are mentioned in a clip, show a real retained-file reattachment,
not an unrelated command excerpt. A new edit must keep the original proof and
pass the demo production checks before upload.

LinkedIn supports [uploaded captions](https://www.linkedin.com/help/linkedin/answer/a552177/add-closed-captions-to-videos-on-linkedin?lang=en)
and [automatic captions with review](https://www.linkedin.com/help/linkedin/answer/a1327025).
Prefer a reviewed caption track for package names, commands and technical terms.

## Hacker News Boundary

[Show HN](https://news.ycombinator.com/showhn.html) is for work people can try,
not a landing page, signup notice or fundraising announcement. Link the usable
source, make installation requirements visible and explain the runtime-free
contributor mode without confusing it with real isolation. There must be a
working path, not just a promise to open the source later.

The [current HN guidelines](https://news.ycombinator.com/newsguidelines.html)
prohibit generated or AI-edited text. The owner must write the title, opening
comment and replies independently; do not copy the generated draft above into
HN or use an assistant to post comments. Prepare factual evidence, not staged
community engagement or requests for votes.

Facts the owner can verify before writing:

- Harakiri is the product/control-plane layer; OpenSandbox is the runtime.
- API, TypeScript SDK, CLI and dashboard are available in the current preview.
- Exact install, validation and architecture boundaries are in the receipt.
- Workspaces retain files, not processes or memory; they are not backups.
- Atomic concurrency admission and historical usage metering remain unfinished.
- Restricted OpenShift Vault/egress enforcement is not certified.
- Runtime/image advisories and artifact-signing limits are disclosed.

## Canonical Links

- [Source](https://github.com/nabilblk/h-sandbox)
- [Candidate rc.8](https://github.com/nabilblk/h-sandbox/releases/tag/v0.5.0-rc.8)
- [Exact delivery evidence](../release-notes/0.5.0-rc.8-delivery.md)
- [Versioned native installation](../../infra/preview/README.md)
- [Developer Preview scope](../developer-preview.md)
- [Quickstart](https://sb.harakiri.io/#docs/quickstart)
- [Demos](https://sb.harakiri.io/#demos)
- [Security policy](../../SECURITY.md)
- [Community questions](https://github.com/nabilblk/h-sandbox/discussions/categories/q-a)

## Launch Window

Before posting, verify anonymous clone and artifact downloads, public docs/API/auth
health, private security reporting, maintainer notification settings and the
newcomer workflow. Keep the older npm stable channel unchanged. The source
opening does not grant anonymous execution access to the lab.

Choose a window when the maintainer can answer questions and correct installation
instructions. Track actual installation/task completion and a voluntary week-two
follow-up, not only stars or impressions. Record support interventions without
customer data. No date, audience size, evaluator identity or response SLA is
claimed by this kit. Broader promotion should pause if a safety or install
regression appears; forks cannot be recalled by making the repository private.
