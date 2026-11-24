---
name: harakiri-deploy
description: Install and self-host Harakiri Sandbox on the user's own infrastructure, then prove a real sandbox works. Use when the user wants to deploy, install, self-host or evaluate Harakiri on Kubernetes (k0s, k8s), restricted OpenShift, a disconnected/air-gapped registry, or locally for development. Detects the target, pins one matching release, runs read-only preflight, asks before changing a cluster and finishes with a checked first sandbox. Not for using an existing installation (use harakiri-sandbox).
---

# Deploy Harakiri Sandbox

Harakiri is a self-hosted sandbox control plane for agent applications. A real
installation has four parts: PostgreSQL, Keycloak-compatible OIDC, the
OpenSandbox runtime chart and the Harakiri chart (API, web, scheduler, template
worker). It is a **Developer Preview** for trusted teams, not a hostile
multi-tenant production platform. Say so when you summarize the result.

This skill holds decisions and guardrails. **Exact commands, versions and
digests come from the release-tagged guides**, never from memory or from this
file. The guides are tested; this skill is not a second copy of them.

## Guardrails

Apply these throughout. They override convenience.

1. **Read-only until approved.** Inspecting is fine. Before any command that
   creates, changes or deletes cluster resources, show the user the exact
   commands, namespaces and cluster-scoped objects, and get a yes.
2. **Explicit target.** Pass `--kubeconfig` and `--context` (or `KUBECONFIG`
   plus `--context`) on every cluster command. Never switch the user's current
   context. Never assume the current context is the intended cluster.
3. **Empty or isolated cluster for the runtime.** The OpenSandbox runtime
   installs cluster-scoped CRDs, ClusterRoles and a controller. If an
   OpenSandbox controller or its CRDs already exist, stop and ask. Never install
   a second controller into a populated cluster.
4. **Secrets stay out of the conversation.** Let the kit generators create
   credentials in their private directories. Do not `cat` generated secret
   files, run `helm get values`, dump Secrets, print environments or put
   credentials in command-line flags or shell history. Ask the user to supply
   API keys through their own shell or Secret manager.
5. **No security workarounds.** Never modify SCCs or grant `anyuid` or
   `privileged`. No hostPath, hostNetwork, fixed UIDs, privilege escalation,
   unconfined seccomp or insecure-TLS switches. If something fails admission,
   fix the configuration or image, or report the limit.
6. **One matching release.** API, web, chart, CLI and SDK versions must match.
   Release candidates are on npm `next`; `latest` is an older stable release
   that lacks current features. Never mix artifacts from different candidates.
7. **Truthful results.** Healthy pods are not a working installation. Report
   what passed, what failed and what was not run. One pass qualifies only that
   exact version, architecture and profile.

## Step 1: Choose the target

Ask what the user wants if it is unclear, then check the environment read-only:

```bash
kubectl config get-contexts            # local file read; no cluster contact
docker info --format '{{.ServerVersion}}' 2>/dev/null
```

After the user names a context, confirm the platform:

```bash
kubectl --context "$CTX" api-resources --api-group=route.openshift.io -o name
kubectl --context "$CTX" get crd -o name | grep -i sandbox
```

Route resources mean OpenShift. Any sandbox CRD means a runtime is already
installed (guardrail 3).

| The user wants | Read |
| --- | --- |
| Develop Harakiri itself, or try the UI/API with no real sandboxes | [references/local.md](references/local.md) |
| Real sandboxes on an empty Kubernetes cluster, or a local k0s VM on macOS | [references/kubernetes.md](references/kubernetes.md) |
| Restricted OpenShift | [references/openshift.md](references/openshift.md) |
| A cluster that cannot reach public registries | [references/airgap.md](references/airgap.md), then the target's file |
| To use an installation that already exists | The `harakiri-sandbox` skill, not this one |

Read only the files you need.

## Step 2: Pin one release

```bash
npm view @h-sandbox/cli dist-tags
```

Choose the version with the user. Then work from source at that tag, so the
kit, guides and release notes all match:

```bash
git clone --branch "v$VERSION" --depth 1 https://github.com/nabilblk/h-sandbox.git
```

In the clone, read `docs/release-notes/$VERSION-delivery.md` (or
`$VERSION.md`) for published coordinates, digests and known limits. If a
target guide pins a different version than the one you chose, follow the
guide's tested version and upgrade path. Do not edit version numbers into
commands validated for another release. Tell the user about the mismatch.

Other documentation sources:

- `docs/` in the tagged clone: matches your chosen version.
- `<web-origin>/llms.txt` of a running installation: that installation's docs.
- `https://sb.harakiri.io/llms.txt`: the public site. It can be newer than
  your tag.

## Step 3: Preflight, read-only

Run the checks in the target's reference file and report the results:
cluster version, node architecture, free CPU/memory/disk, default
StorageClass, permissions and existing CRDs. Give a clear go or no-go with
reasons.

## Step 4: Plan and confirm

Summarize the install for approval in one message:

- the target (context, namespaces);
- the exact version, chart archives and the digests you will check;
- the cluster-scoped objects to be created;
- where private configuration will be written;
- the commands, in order.

Do not mutate anything until the user approves.

## Step 5: Install

Follow the target's reference file and the tagged guide it points to. After
each phase, wait for rollout and check status before continuing. On failure,
diagnose with targeted events, `describe` and component logs (guardrails 4
and 5). Do not loop patch-and-restart.

## Step 6: Prove a real sandbox

An installation is done only when one real task works end to end:

1. The user signs in to the dashboard, completes onboarding and creates a
   **scoped, expiring** API key. They export it in their own shell.
2. Install the matching CLI (`npm install -g @h-sandbox/cli@$VERSION`), then:

   ```bash
   harakiri doctor          # never prints the key
   harakiri capabilities    # what this runtime profile supports
   ```

3. Import or select a template and run a deterministic check: create one
   sandbox, run a command with a known output, write and read back a file,
   terminate it and confirm termination. The `harakiri-sandbox` skill has the
   CLI patterns. Use the kit's smoke script if the target provides one.

Report any capability shown as unavailable. Do not try to work around it.

## Step 7: Hand off

Give the user a short report:

- the version, chart digests and image digests used;
- each check, marked passed, failed or not run;
- where the private configuration and kubeconfig live, and that they must be
  protected and backed up with the database and encryption keys;
- the next steps they own, such as public ingress/TLS, SMTP for invitations,
  backups, and stable-release status.

## Day 2

Upgrades, backup/restore and uninstall are high-risk. Before helping, read the
tagged `docs/operations/standalone-recovery.md` and the release notes. Rules
that always apply:

- Back up the database, encryption keys and configuration first.
- `helm rollback` does not undo database migrations.
- Do not use `--reuse-values` across changed contracts.
- Do not do mixed-version rolling upgrades.
- Terminate sandboxes through Harakiri before uninstalling.
- Never delete namespaces, CRDs or shared dependencies as a shortcut.
