# Agent Observability: Candidate Operator Guide

Status: unreleased source candidate, 2026-11-10. Do not enable this on a customer
cluster or infer production readiness from render tests. Existing published
rc.15 images/packages do not contain these changes. No current deployment was
changed. Restricted OpenShift is explicitly blocked until native qualification.
The maintainer deferred that qualification on 2026-11-10; it is not part of the
current test run and is not an implicit compatibility claim.

**Distribution gate failed:** the 2026-11-10 Grype audit of the pinned amd64
images found high/critical dependency advisories in both Victoria images.
Functional qualification is not security qualification. Do not deploy these
pins in production or suppress the findings to get a green release. See the
[audit decision](evidence/agent-observability-image-audit-2026-11-10.md).

## Prerequisites and Ownership

- Matching source-built API and web images, migration 041 and the candidate chart.
- Existing supported PostgreSQL, identity and runtime installation. Telemetry does
  not replace any of them or grant additional Kubernetes permissions to the API.
- A disposable namespace, dynamic PVC provisioner and a CNI that actually enforces
  NetworkPolicy. Storage has no end-user authentication of its own; policy
  enforcement is part of the boundary, not an optional optimization.
- An explicit resource budget: three single-replica components, 768 MiB total
  requested/limited memory, 300m requested CPU, 1 CPU limit each, and 21 GiB PVCs.
  These are small qualification defaults, not measured production sizing.

Collector and storage are private ClusterIP services. Workloads send OTLP only
through the public Harakiri API. No new Ingress, Route, hostPath, DaemonSet,
cluster-scoped RBAC, SCC change or runtime-provider bypass is added. The profile
uses non-root UID/GID 10001 with PVC fsGroup; it is not an arbitrary-UID claim.

## Render Before Installing

Choose a disposable context and namespace explicitly. Do not use a context merely
because it happens to be current. The following commands are operator instructions,
not commands executed by the implementation or a self-modifying installer.

```bash
export CONTEXT=disposable-acceptance
export NAMESPACE=harakiri-telemetry-test
umask 077
mkdir -p .private
openssl rand -hex 32 | tr -d '\n' > .private/collector-token
kubectl --context "$CONTEXT" -n "$NAMESPACE" create secret generic telemetry-collector \
  --from-file=token=.private/collector-token
```

Keep the existing private installation values, including matching candidate image
digests, database credentials and public URLs. Add these **non-secret** overrides:

```yaml
observability:
  enabled: true
  acknowledgePreview: true
  allowContent: false
  retentionDays: 7
  collectorTokenSecret:
    name: telemetry-collector
    key: token
  storageClass: ""  # use the test cluster's default
  queueSize: 1Gi
  logsSize: 10Gi
  tracesSize: 10Gi
```

```bash
helm template harakiri infra/charts/harakiri -n "$NAMESPACE" \
  -f .private/installation-values.yaml -f telemetry-values.yaml
# Inspect the manifest, namespace, image digests and NetworkPolicies first.
helm upgrade --install harakiri infra/charts/harakiri \
  --kube-context "$CONTEXT" -n "$NAMESPACE" \
  -f .private/installation-values.yaml -f telemetry-values.yaml \
  --atomic --timeout 10m
```

The profile refuses missing acknowledgement/Secret references, unpinned image
overrides, invalid retention and `openshift.restricted=true`. Image digests come
from the checked-in qualification manifest. A private registry mirror can override
`observability.images.collector`, `.logs` and `.traces`, preserving the exact
qualified digest. No artifact is downloaded from an unversioned URL at startup.

## Enable One Organization

After the API is ready, sign in as its organization administrator. Open Agent runs
and enable Capture policy. The operator flag alone never enables every tenant.
Start metadata-only. Create a scoped key with `runs:read`, `runs:write` and
`sandboxes:write`; default/existing API keys retain their previous scopes.

Use the matching source-built SDK or the generated [OpenAPI](../openapi.json).
Use the optional SDK telemetry subpath/extra for explicit run ownership and
bounded final flush, or issue a grant for an existing official OTLP exporter.
Validate query visibility and the native viewer
before enabling any content capture. See the public-source guide at
`apps/web/src/observability-docs.tsx` for the actual SDK methods.

## Optional External OTLP Forwarding

The candidate Collector can forward the same sanitized traces and logs to an
operator-owned OTLP/HTTP destination, including a compatible Vector receiver.
This is additive fan-out, not export-only mode or a replacement query backend.
The native viewer still reads the bundled Victoria services. The shared external
credential gives that destination access to all opted-in organizations' exported
data; approve its trust, location, access control and retention before enabling it.

Create a Kubernetes Secret separately with an `authorization` key containing the
complete destination header value, for example `Bearer <private-token>`. Do not
put that value in Helm values or a command-line argument. Configure a base HTTPS
endpoint; the official exporter appends `/v1/traces` and `/v1/logs`:

```yaml
observability:
  externalExport:
    enabled: true
    endpoint: https://otel.example.internal
    authorizationSecret:
      name: external-otel-authorization
      key: authorization
    egress:
      - to:
          - ipBlock:
              cidr: 192.0.2.10/32 # replace with the operator-approved destination
        ports:
          - protocol: TCP
            port: 443
```

The chart rejects HTTP, credentials in the URL, missing Secret references and
missing explicit egress rules. Kubernetes NetworkPolicy is not DNS policy:
maintain the permitted addresses or use your CNI's reviewed equivalent. This
example address is documentation-only; it does not grant general Internet access.
Use a destination certificate trusted by the Collector; no insecure TLS switch
is supplied. Private CA distribution is not yet a chart feature.

Forwarding runs **after** the same privacy filter and has separate bounded queues
and retry, with the destination credential supplied from the Secret, not an
ingestion grant. Its outage does not make agent execution wait indefinitely,
but export loss remains possible. The real-component test verifies both signals
and absence of synthetic metadata-only canaries. It uses an actual OTLP receiver,
not a Vector binary, and does not establish native cluster egress enforcement.

## Limits and Failure Semantics

- Grant lifetime: at most 15 minutes and the issuer's remaining lifetime. New
  grants require a live run/sandbox; final flush is bounded to two minutes.
- Recording window: at most 24 hours. Read deadline: default seven days, 1-30
  configurable, independent of sandbox termination.
- Ingest: 1 MiB wire and decoded body; default 600 requests / 16 MiB decoded per
  tenant per fixed minute. Request/byte accounting is atomic in PostgreSQL.
- API concurrency: at most 16 active ingest requests and 16 storage reads per
  process. Telemetry uses its own pool of three DB connections, one-second
  acquisition deadline and two-second statement deadline.
- Queries: at most 1,000 records, 31 days, 16 MiB response and one MiB per row.
  Span/log reads are bounded snapshots, not full-history cursor streams.
- Collector: 192 MiB memory limiter, 128 tenant batch partitions per process
  lifetime, 200 ms batching, 8 MiB persistent queue per signal, 32 MiB queue-file
  limit, two consumers, five-second export deadline and at most 60 seconds retry.
- Storage: 128 MiB allowed-memory setting under 256 MiB container limits. One-second
  data/index flush and three-second trace search offset trade I/O for interactivity.

Collector acknowledgement does not prove persistence: pre-queue batch memory can
be lost. Retries can create duplicates, queues can fill and bounded retry can drop
records. The viewer exposes read limits, ingestion rejection and query failures;
it does not yet report every downstream exporter drop per run. Never label a run
"fully captured" based on those indicators.

## Monitoring, Recovery and Disablement

Private Collector metrics are on port 8888 but not exposed by the Service or
NetworkPolicy. Add narrowly scoped operator scraping only after review. Monitor
receiver/exporter failures, queue size/capacity, refusals, CPU/memory, PVC bytes and
inodes, and accepted-to-queryable delay. Inspect private component health, not just
the public API health response. No node-log collection is required.

When queries fail, check storage readiness and network policy before retrying.
When export fails, check grant expiry, issuer permissions, organization policy,
rate limits and the Collector Secret. Do not enable debug exporters or log request
bodies to troubleshoot sensitive telemetry. Configuration intentionally logs only
errors; exception contents can still be sensitive and require restricted access.

Disable organization capture first; this revokes outstanding grants. Disabling
the chart removes telemetry workloads, not their PVCs. Explicitly retained
StatefulSet PVCs survive uninstall/scale-down. Inventory them and apply the
organization's retention policy before any later manual reclamation.

For Collector token rotation, create a new Secret name and reference it in a
reviewed Helm upgrade. Both API and Collector then receive the new reference.
Brief authentication failures during the rollout are possible; no seamless dual-key
rotation is claimed. Do not print or commit the old or new value.

Treat PostgreSQL's run/tenant mapping, both storage PVCs and the Collector queue as
one recovery set. Never restore the tenant mapping independently over unrelated
storage: numeric tenant IDs are security boundaries. Retained content may also
exist in backups. Revocation does not retract already accepted queue records.

### Cold Recovery Contract

The isolated acceptance harness passed the following **same-version** recovery
path on Linux/amd64 in [GitHub run 42821918562](https://github.com/nabilblk/h-sandbox/actions/runs/42821918562).
The [sanitized receipt](evidence/agent-observability-recovery-2026-11-10.json) records
fresh telemetry volumes and retained browser investigation. The image-security
gate still blocks production use. This is not an authorization to delete existing
volumes, nor a cross-version recovery recipe.

1. Stop accepting new work. Confirm there are no active runtimes, attached
   workspaces or template builds. Disable capture for every organization and
   revoke outstanding ingestion grants before stopping API/scheduler/build writers
   and the identity service.
2. Stop the Collector before storage. Preserve its persistent queue together with
   both telemetry stores. A quiesced checkpoint avoids mixing a database mapping
   from one recovery point with signals or queue records from another.
3. Keep both application and identity database backups, all three telemetry
   volume archives, encryption/configuration Secrets, exact image/chart identity
   and a manifest in one encrypted, access-controlled backup set. Validate every
   checksum before changing a destination. A checksum detects accidental mixing
   or corruption; it is not an authenticity signature. File permissions are not
   encryption.
4. Restore the databases and telemetry volumes to empty replacement storage.
   Verify the organization-to-numeric-tenant mapping against the same manifest,
   including its identity sequence. Preserve revoked grants and disabled capture.
   Never merge an old tenant map into unrelated retained storage.
5. Start storage, then the Collector, then identity and application services.
   Verify the original account/organization, unchanged capacity, rejected old
   ingestion credentials and retained span/log reads through the public API and UI.
   Re-enable capture only as a separate explicit operator action.

The test uses generated, private, short-lived archives on a disposable runner;
none is uploaded as an artifact. It does not test a production encryption service,
CSI snapshot portability, cross-version data formats, queued deletion replay or
physical erasure from storage/backups. Its detached-volume operator pods are not
sandbox execution and do not add Kubernetes-exec permissions to the application.

**Unqualified operations:** online/HA or cross-version recovery, rollback across
storage versions, timed physical reclamation, secure erasure/replay fencing, capacity
sizing and restricted OpenShift. Do not improvise a production recovery procedure
from these component tests. Keep the feature disabled where those guarantees are
required. External OTLP forwarding is component-qualified, not a second required
pipeline or a qualified native-query backend. Vector-specific deployment and
authentication compatibility require an operator acceptance test.

## Reproduce Local Evidence

Follow [the isolated qualification guide](../../infra/observability/README.md).
It never uses a cluster, existing database or live model credentials. Helm tests
only render. Its browser tests use labelled fixtures. The separate hosted native
job uses an actual fresh cluster, commands, OIDC browser and cold recovery. Real
sandbox-backed model-agent investigation remains a separate gate.
