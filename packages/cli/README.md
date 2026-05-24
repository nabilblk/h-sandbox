# Harakiri CLI

Command-line client for Harakiri Sandbox.

```bash
harakiri init
harakiri login --api-url http://127.0.0.1:18082 --api-key hk_live_...
harakiri create --template python-3.12-data --env HARAKIRI_ENV_SMOKE=env-ok
harakiri run --stdin agent.py
harakiri template init --name open-agents-dev --dockerfile Dockerfile
harakiri template build --name open-agents-dev .
harakiri template build --name ubuntu-import --source image --image ubuntu:24.04
```

Dockerfile builds package the local context as tar+gzip, upload it to the API,
run Kaniko in k0s, and store a digest-pinned ready template version.
