# Harakiri CLI

Command-line client for Harakiri Sandbox.

```bash
harakiri init
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...
harakiri create --template python-3.12-data
harakiri run --stdin agent.py
harakiri template init --name open-agents-dev --dockerfile Dockerfile
harakiri template build --name open-agents-dev . --image registry.example.com/harakiri/open-agents-dev:dev
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
```

Dockerfile builds package the local context as tar+gzip, upload it to the API,
and store a verified `sha256:` context hash. The k0s BuildKit worker that turns
those uploaded contexts into pushed images is still part of the active rollout.
