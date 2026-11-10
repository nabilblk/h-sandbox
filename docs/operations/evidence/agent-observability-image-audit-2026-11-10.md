# Observability Image Audit: Release Blocked

Date: 2026-11-10. Scanner: Grype 0.118.0, registry scans of `linux/amd64` and
`linux/arm64`. Both platforms produced the counts below.
Exact multi-architecture image digests are recorded in
[`infra/observability/images.json`](../../../infra/observability/images.json).
This is a dependency inventory, not demonstrated exploitation or proof that every
advisory is reachable through Harakiri's authenticated, bounded ingress.

| Component | Total matches | High / critical | Decision |
| --- | ---: | ---: | --- |
| Collector 0.165.0 | 0 | 0 | No findings in this scan, not a permanent guarantee |
| VictoriaLogs 1.53.0 | 12 | 11 | Block distribution |
| VictoriaTraces 0.13.0 | 1 | 1 | Block distribution |

VictoriaLogs includes Go stdlib 1.27.1 with a critical HTTP/2 flow-control finding
and other high findings. The scan identifies fixed Go releases, including 1.27.2;
its additional medium finding needs 1.27.3. Both Victoria binaries include affected
`github.com/klauspost/compress` releases (1.20.0 / 1.20.1); the advisory identifies
1.20.2 as fixed. Sources:
[Go issue 81743](https://go.dev/issue/81743) and
[compress advisory](https://github.com/klauspost/compress/security/advisories/GHSA-fpmh-frq8-7rj8).

The latest upstream releases checked through GitHub on this date were still
[VictoriaLogs v1.53.0](https://github.com/VictoriaMetrics/VictoriaLogs/releases/tag/v1.53.0)
and [VictoriaTraces v0.13.0](https://github.com/VictoriaMetrics/VictoriaTraces/releases/tag/v0.13.0).
There was no newer published upstream release to substitute. No unreviewed fork,
custom vendor build, audit exception or deployment was introduced.

## Reproduce and Resolve

```sh
node infra/observability/scan-images.mjs --platform linux/amd64
node infra/observability/scan-images.mjs --platform linux/arm64 \
  --output docs/artifacts/observability-image-audit-arm64
```

The script exits nonzero for high/critical matches and retains full JSON plus a
sanitized receipt, database metadata, scanner version, platform and image digests.
Local report files are ignored artifacts, not credentials. The CI workflow audits
both architectures and uploads results even on failure. The same findings were
confirmed on GitHub in [run 42820096337](https://github.com/nabilblk/h-sandbox/actions/runs/42820096337);
its functional jobs passed while both image-security jobs failed.

**Maintainer decision, 2026-11-10:** wait for patched upstream images. Do not
maintain custom replacement builds and do not waive the high/critical gate.
Use patched upstream digests when available. Re-run the image audit,
Collector/storage qualification and upgrade/recovery tests for changed images.
Until then keep the candidate disabled in production and the execution plan open.
