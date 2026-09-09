# Security Policy

## Supported Versions

The project is pre-1.0. The current delivered candidate is `0.5.0-rc.8` on npm
`next`; npm `latest` still points to `0.4.0`. The consolidated authorization
boundary first shipped in `0.5.0-rc.4` and is retained in rc.8. Do not use the
older stable channel as a substitute for the current preview. There is no
published backport or response-time SLA. Fixes are developed on `main` and must
be released as new, immutable versions before operators can rely on them.

Use the [rc.8 delivery and image-scan receipt](docs/release-notes/0.5.0-rc.8-delivery.md),
the [authorization upgrade order](docs/release-notes/0.5.0-rc.4.md) when upgrading
from older versions, and the [preview limits](docs/developer-preview.md).
Inherited distribution advisories remain open; published source and a passing
JavaScript dependency audit do not establish vulnerability-free images. A
preview is not permission to expose development identities or ignore reports.

## Reporting A Vulnerability

Email [nabilblk@gmail.com](mailto:nabilblk@gmail.com) with the subject
`[Harakiri Security] <short description>`. The repository maintainer,
[@nabilblk](https://github.com/nabilblk), owns initial triage, private follow-up
and coordination of fixes and disclosure. This contact was designated by the
owner on September 9, 2026. There is no response-time SLA; if you have not
received an acknowledgement, follow up in the same email thread.

Do not open a public issue for a suspected vulnerability or paste credentials
into a report. GitHub private vulnerability reporting is not currently offered;
use email, including while the repository is private. Enable and test GitHub
reporting notifications before advertising it as another reporting route.

Include:

- affected component: API, web, CLI, SDK, template builder, Kubernetes
  manifests, or docs
- exact commit or version tested
- reproduction steps
- expected impact
- whether credentials, registry secrets, sandbox data, or route access are
  involved

Send a minimal reproduction with synthetic data, not a database dump, full
token, secret-bearing logs or customer repository. Coordinate disclosure and
credential rotation privately. Removing a string from Git does not revoke it.

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
