# Installing on OpenShift

Use the canonical [single-namespace staged runbook](../OCP-install/harakiri-security/README.md).
It covers exact artifacts, preparation, dependencies, OpenSandbox, Harakiri,
optional BackgroundAgent, Routes, secrets and acceptance.

```bash
oc login https://api.your-cluster.example.com:6443
docker login core.campus.clusterdiali.me
export INSTALL_BACKGROUND_AGENT=true # omit for Harakiri only
./OCP-install/harakiri-security/install.sh prepare
./OCP-install/harakiri-security/install.sh dependencies
./OCP-install/harakiri-security/install.sh opensandbox
./OCP-install/harakiri-security/install.sh sandbox
./OCP-install/harakiri-security/install.sh background-agent
./OCP-install/harakiri-security/install.sh verify
```

Review the private rendered state before installing. Ownership checks protect
existing data. No implicit login, source-chart fallback, restart repair or SCC
modification. OpenSandbox CRDs and cluster RBAC still require platform approval;
one application namespace is not zero cluster-scoped prerequisites.

The default restricted profile supports open-network sandboxes and image-backed
templates. Current dns+nft egress needs NET_ADMIN and is not enabled by bypassing
OpenShift restrictions. Credential Vault stays unavailable without the provider's
supported profile. See [Vault operations](credential-vault-operations.md).

Default 0.4.0 artifacts do not include Phase 2B; workspaces/streams need a later
compatible release and an approved [storage profile](persistent-workspace-operations.md).

**September acceptance:** revised preparation/unit checks passed. Fresh CRC
installation remains pending approval to replace the populated lab namespace.
Older installation evidence does not validate this revised package.
