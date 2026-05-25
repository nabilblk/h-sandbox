# Security Policy

## Supported Versions

The project is pre-1.0. Security fixes are applied to the main development
branch until a release policy is published.

## Reporting A Vulnerability

Do not open a public issue for a suspected vulnerability. Email the maintainers
or use GitHub private vulnerability reporting when it is enabled for the
repository.

Include:

- affected component: API, web, CLI, SDK, template builder, Kubernetes
  manifests, or docs
- exact commit or version tested
- reproduction steps
- expected impact
- whether credentials, registry secrets, sandbox data, or route access are
  involved

## Project Security Boundaries

- Harakiri owns control-plane state: users, organizations, API keys, templates,
  builds, schedules, routes, usage, and audit events.
- OpenSandbox owns sandbox runtime lifecycle and data-plane access.
- Harakiri must not use direct Kubernetes `pods/exec` or sandbox `pods/log` for
  normal runtime behavior.
- Template registry credentials must not be returned by API responses or logged
  in plaintext.
- Sandbox environment variable values are runtime inputs; control-plane events
  should store only key names.

See [docs/opensandbox-boundaries.md](docs/opensandbox-boundaries.md) and
[docs/template-security.md](docs/template-security.md) for the detailed
architecture rules.
