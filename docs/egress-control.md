# Outbound Access

Harakiri exposes OpenSandbox egress control as **Outbound access**. OpenSandbox
owns the runtime dataplane: initial policies are passed as `networkPolicy` when
the sandbox is created, and running sandboxes are updated through the
OpenSandbox egress sidecar on port `18080`.

Harakiri owns the developer experience around that primitive: modes, presets,
workspace guardrails, template defaults, sandbox overrides, audit events, CLI
commands, SDK helpers, and dashboard diagnostics.

## Modes

- `open`: allow outbound traffic. Existing templates use this by default for
  backward compatibility.
- `restricted`: deny by default and allow selected presets or domains. This is
  the recommended mode for agent-oriented templates.
- `blocked`: deny all outbound traffic.
- `custom`: advanced allow and deny domain rules.

Rules are FQDN or wildcard-domain targets such as `api.github.com` or
`*.pythonhosted.org`. URLs, ports, IP addresses, CIDRs, localhost, and metadata
endpoints are rejected by the Harakiri validator because OpenSandbox's stable
egress contract is domain based.

## Presets

Harakiri ships these developer presets:

- `python-package-install`: PyPI, Python package artifact hosts, and Astral
  hosts used by uv.
- `node-package-install`: npm registry and Node distribution hosts.
- `git-hosting`: GitHub API, raw, objects, and archive hosts.
- `llm-apis`: common hosted model API domains.
- `browser-basic`: an operator-facing preset for broad browser access.

Presets expand to explicit domain rules before being sent to OpenSandbox. The
dashboard shows the preset label; the API and audit log keep the expanded
compiled policy for later explanation.

## Workspace guardrails

Workspace admins configure **Settings > Outbound access**:

- default mode for newly created templates
- which presets are available to the team
- whether users can add custom domains
- max expanded rules per sandbox
- optional domain redaction for future policy event views

These guardrails are enforced by the API for template defaults, new sandboxes,
and runtime sandbox policy updates. If custom domains are disabled, explicit
`allow` or `deny` domains are rejected with `egress_custom_domains_disabled`.
If a disabled preset is requested, the API returns `egress_preset_not_allowed`.

## Template defaults

Template detail has an **Egress** tab. Team templates can store outbound access
as a default so every new sandbox starts with the right policy. The dashboard
also exposes the same controls in **New template**, and the generated
`harakiri.toml` preview includes `egress_mode`, `egress_presets`, and
`egress_allow` entries.

The API endpoint is:

- `PATCH /v1/templates/:id/egress`

Template versions snapshot the policy. Updating the current template default
also updates the latest ready version so newly created sandboxes inherit the
visible dashboard state.

## CLI

Create a restricted sandbox:

```bash
harakiri create \
  --template python-3.12-data \
  --name package-test \
  --egress restricted \
  --egress-preset python-package-install \
  --allow api.github.com
```

Inspect and update a running sandbox:

```bash
harakiri egress sbx_...
harakiri egress allow sbx_... example.com
harakiri egress deny sbx_... telemetry.example.com
harakiri egress block sbx_...
harakiri egress test sbx_... https://pypi.org/simple
```

## API

Create with outbound access:

```bash
curl "$PUBLIC_API_URL/v1/sandboxes" \
  -H "x-api-key: $HK_KEY" \
  -H "content-type: application/json" \
  -d '{
    "template": "python-3.12-data",
    "egress": {
      "mode": "restricted",
      "presets": ["python-package-install"],
      "allow": ["api.github.com"]
    }
  }'
```

Runtime endpoints:

- `GET /v1/sandboxes/:id/egress`
- `PATCH /v1/sandboxes/:id/egress`
- `POST /v1/sandboxes/:id/egress/test`
- `PATCH /v1/templates/:id/egress`

## SDK

```ts
const { sandbox } = await client.createSandbox({
  template: "python-3.12-data",
  egress: {
    mode: "restricted",
    presets: ["python-package-install"],
    allow: ["api.github.com"]
  }
});

await client.allowEgress(sandbox.id, ["example.com"]);
const result = await client.testEgress(sandbox.id, "https://example.com");
```

## Dashboard

Open a sandbox and select **Network**. The page is split into:

- **Inbound routes**: ports exposed from the sandbox to users.
- **Outbound access**: domains the sandbox can reach.

Outbound access shows the mode, provider status, preset chips, domain rules,
recent policy events, and a test bar. The UI uses product vocabulary such as
"Allowed domains" and "Blocked by policy"; OpenSandbox internals stay in the
docs and diagnostics.

The `Test access` action runs from inside the sandbox so the result reflects the
runtime environment. Minimal images must include `curl`, `wget`, `python3`, or a
similar network-capable tool for the probe to execute; otherwise the policy can
still be active while the test reports that no probe tool is available.

## Operator Notes

Use OpenSandbox egress mode `dns+nft` when strict deny-by-default behavior is
required. The egress sidecar needs `CAP_NET_ADMIN`; if that capability is
missing, OpenSandbox may degrade DNS/IP enforcement. Harakiri reports provider
availability and enforcement mode from the sidecar when it can resolve the
egress endpoint.

By default Harakiri sends a no-op allow-all OpenSandbox `networkPolicy` when it
creates open-network sandboxes so those sandboxes can later be changed to
restricted mode. Restricted OpenShift profiles that cannot run the egress
sidecar should set `OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY=0`; open-network
sandboxes will start without the sidecar, while restricted/custom/blocked egress
remains unavailable until the runtime is granted an approved egress profile.

Harakiri does not implement Kubernetes NetworkPolicy generation, custom packet
filtering, or HTTPS MITM in the MVP. Route exposure is inbound; outbound access
is egress policy. Treat them as separate controls.
