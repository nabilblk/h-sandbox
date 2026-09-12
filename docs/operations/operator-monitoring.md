# Private Operator Monitoring

Source preview. No new release or populated-cluster deployment is implied by
these files. Public product definitions: [Usage observations](https://sb.harakiri.io/#docs/usage-observations).

## Configure Deliberately

Collection is enabled by default independently of metrics. `usage.retentionDays`
accepts 1..30. API and scheduler need matching settings and migration 039.

The chart defaults metrics to disabled and loopback binding. To enable, provide
an operator-owned Secret containing a dedicated random token of at least 32
non-whitespace characters. Select it with `metrics.tokenSecret.name` and `.key`.
Generate and distribute it using your secret manager, not a committed YAML value.
This token cannot authenticate to the product API. Rotation requires normal pod
replacement because the selected value is read at process start.

```yaml
metrics:
  enabled: true
  host: "127.0.0.1"
  port: 9130
  tokenSecret:
    name: harakiri-private-metrics
    key: token
  podMonitor:
    enabled: false
```

There is no public Service or Ingress. `GET /metrics` requires the bearer token;
every other method/path is rejected. Use an authorized loopback port-forward to
one API or scheduler pod for diagnosis. Never add the metrics port to cloudflared,
the public API proxy, an OpenShift Route, or a public load balancer.

Pod-network scraping requires an explicit `metrics.host: 0.0.0.0` decision and an
operator-reviewed NetworkPolicy allowing TCP 9130 only from monitoring pods. Keep
existing API 8080 ingress rules intact. Kubernetes policies are additive: an
existing broad allow policy can defeat a newly added restrictive one. The chart
does not install a guessed permissive policy that widens customer access.

The listener is HTTP. On an untrusted pod network, terminate authenticated TLS in
the operator's mesh/proxy or retain loopback-only collection; a bearer token does
not encrypt traffic. Application `/health` is independent of this listener.

Optional `metrics.podMonitor.enabled: true` renders only with an available
`monitoring.coreos.com/v1/PodMonitor` CRD and pod-network binding. Set
`metrics.podMonitor.labels` to the labels selected by your Prometheus operator.
The monitor is namespace-local and references the dedicated Secret there. The
operator needs its own approved discovery/Secret RBAC; Harakiri grants none.

## Metric Dictionary

| Series | Meaning |
| --- | --- |
| `harakiri_observer_enabled` | Explicit configuration, 1 only on an enabled scheduler. |
| `harakiri_observer_last_success_timestamp_seconds` | Last completed collector pass in this process; zero before its first success. |
| `harakiri_observer_pending` | Pending observation rows after the last completed pass, not currently running sandboxes. |
| `harakiri_observer_oldest_pending_timestamp_seconds` | Oldest pending acceptance timestamp; zero with no pending work. |
| `harakiri_observer_errors_total` | Collection/write failures since process start. |
| `harakiri_readiness_probe_duration_seconds` | Histogram of bounded observer probes by five fixed statuses. Not startup latency. |
| `harakiri_scheduler_last_success_timestamp_seconds` | Last completed maintenance pass, including reconciliation and expiry. Individual recoverable failures can also be logged by existing workers. |
| `harakiri_scheduler_errors_total` | Failed whole maintenance passes. |
| `harakiri_admission_denial_attempts_total` | HTTP capacity errors by five fixed reasons. Retries count as attempts, never unique jobs. |

Labels are restricted to component and enumerated reason/status. No organization,
sandbox, user, credential, domain or workspace labels exist. No request bodies,
command output, token strings or provider error text enter these metrics. Keep
scrape labels similarly bounded. Counters reset on restart; use `rate`/`increase`,
not subtraction across a restart. Product history remains in PostgreSQL.

## Alerts and Missing Telemetry

Use [the alert rules](../../infra/monitoring/alerts.yaml) and
[promtool fixtures](../../infra/monitoring/alerts.test.yaml). They are examples,
not an automatic deployment or an SLO. Rules exercise byte pressure, inode
pressure even with abundant bytes, sustained lag, reset recovery, deliberate
disablement and missing required telemetry.

```bash
cd infra/monitoring
promtool check rules alerts.yaml
promtool test rules alerts.test.yaml
```

CI executes pinned Prometheus 3.5.1 `promtool` in a disposable container; the rules
install no monitoring service. See the upstream [rule-test format](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)
and [maintained Node client](https://github.com/prometheus/client_js).

For storage rules, map the actual registry/database/workspace filesystem series
from the existing node exporter with `harakiri_storage="true"`. Supply a reviewed
inventory gauge `harakiri_expected_storage_filesystem{instance,mountpoint}=1` for
every required path. Match these labels exactly to the exporter, including mount
paths that differ inside containers. For expected application targets supply
`harakiri_expected_metrics_target{job,instance}=1`. These small inventory series
are **operator inputs**, not exported by Harakiri and not inferred from healthy
targets. Without them, missing-series rules cannot detect removed discovery.

Kubelet PVC metrics, CSI exporters and database-level capacity may supplement or
replace node filesystem rules according to the supported storage system. Quotas,
object stores and filesystems without inodes require equivalent operator evidence;
do not label them healthy because a Linux inode series is absent.

| Alert | Initial action; never automatic remediation |
| --- | --- |
| Collection delayed/backlog | Inspect safe scheduler error messages, database connectivity, pending age and provider probe support. Increase observation budget only after measuring load. |
| Scheduler delayed | Check reconciliation and expiry progress immediately; observation graphs cannot authorize capacity release. |
| Denial pressure | Inspect authenticated organization capacity and caller retries; do not assume a global utilization percentage or automatically raise limits. |
| Bytes/inodes low | Route to the volume owner with exact storage path, free quantities and growth. Preserve active work and backups; no automatic prune/resize. |
| Metrics missing | Check target inventory, discovery, Secret rotation, authentication and NetworkPolicy before treating missing data as zero. |

## Harbor Evidence and Release Ownership

The Harbor/storage operator owns physical headroom evidence. The Harakiri release
maintainer records it in the delivery receipt: timestamp, host/volume identity,
registry data path, free/total bytes, free/total inodes, quotas, recent growth and
the operator's identity. The designated product contact is `nabilblk@gmail.com`;
that contact does not imply storage-host access was supplied.

Current physical Harbor headroom remains **unverified**. HTTP health, successful
push/pull and project quota checks are service evidence only. Do not run intrusive
host discovery, prune artifacts or resize the user's storage to close this note.

## Failure and Recovery

Metrics listener bind/configuration failure logs a fixed error and does not stop
the product service. A missing Kubernetes Secret is a deployment error and must
be corrected through the normal values/secret review. Missing metrics must alert.

The observer has a dedicated two-connection pool, two-second statement timeout,
three-second client/idle-transaction timeout and one-second acquisition timeout.
No connection spans a network probe. Admission and cleanup use the existing pool.
Observation tables and epochs belong in the coordinated application DB backup;
restore does not recreate already-pruned readiness samples. Preserve missing
coverage and never modify operational reservations as a monitoring repair.

See [the usage implementation contract](usage-observations.md),
[standalone recovery](standalone-recovery.md) and [release operations](../ci-release.md).
