# OpenSandbox install

The deployment script installs the official OpenSandbox chart into `opensandbox-system` when Helm can reach the chart release artifact. The Harakiri API is configured with `OPEN_SANDBOX_BASE_URL=http://opensandbox-server.opensandbox-system.svc.cluster.local:8080`.

The control-plane adapter has development fallback enabled in `infra/k8s/harakiri/harakiri.yaml` so dashboard and CLI flows remain usable while the OpenSandbox chart is settling or if the local VM lacks nested virtualization support.

