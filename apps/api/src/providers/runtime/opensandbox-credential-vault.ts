import type {
  CredentialVaultBinding,
  CredentialVaultProviderState
} from "@harakiri/shared";
import { OpenSandboxHttpError } from "./opensandbox-client.js";
import type {
  RuntimeCredentialVaultApplyInput,
  RuntimeCredentialVaultDeleteInput
} from "./provider.js";
import { callSandboxSidecarText, OPEN_SANDBOX_EGRESS_PORT } from "./opensandbox-sidecar.js";

type OpenSandboxCredential = {
  name: string;
  source: {
    type: "inline";
    value: string;
  };
};

type OpenSandboxCredentialVaultCreateRequest = {
  credentials: OpenSandboxCredential[];
  bindings: CredentialVaultBinding[];
};

type OpenSandboxCredentialVaultMutationRequest = {
  expectedRevision?: number;
  credentials?: {
    add?: OpenSandboxCredential[];
    replace?: OpenSandboxCredential[];
    delete?: string[];
  };
  bindings?: {
    add?: CredentialVaultBinding[];
    replace?: CredentialVaultBinding[];
    delete?: string[];
  };
};

const parseVaultState = (body: string): CredentialVaultProviderState => JSON.parse(body) as CredentialVaultProviderState;

const toOpenSandboxCredentials = (input: RuntimeCredentialVaultApplyInput): OpenSandboxCredential[] =>
  input.credentials.map((credential) => ({
    name: credential.name,
    source: {
      type: "inline",
      value: credential.value
    }
  }));

const partitionByExistingName = <T extends { name: string }>(items: T[], existingNames: Set<string>) => ({
  add: items.filter((item) => !existingNames.has(item.name)),
  replace: items.filter((item) => existingNames.has(item.name))
});

const mutationEntries = <T>(entries: { add: T[]; replace: T[] }) => ({
  ...(entries.add.length ? { add: entries.add } : {}),
  ...(entries.replace.length ? { replace: entries.replace } : {})
});

const postVault = async (opensandboxId: string, request: OpenSandboxCredentialVaultCreateRequest) =>
  parseVaultState(await callSandboxSidecarText(opensandboxId, OPEN_SANDBOX_EGRESS_PORT, "credential vault", "/credential-vault", {
    method: "POST",
    body: JSON.stringify(request)
  }));

const patchVault = async (opensandboxId: string, request: OpenSandboxCredentialVaultMutationRequest) =>
  parseVaultState(await callSandboxSidecarText(opensandboxId, OPEN_SANDBOX_EGRESS_PORT, "credential vault", "/credential-vault", {
    method: "PATCH",
    body: JSON.stringify(request)
  }));

export const getSandboxCredentialVault = async (opensandboxId: string) => {
  try {
    const body = await callSandboxSidecarText(opensandboxId, OPEN_SANDBOX_EGRESS_PORT, "credential vault", "/credential-vault");
    return parseVaultState(body);
  } catch (error) {
    if (error instanceof OpenSandboxHttpError && error.status === 404) return null;
    throw error;
  }
};

export const applySandboxCredentialVault = async (input: RuntimeCredentialVaultApplyInput) => {
  const credentials = toOpenSandboxCredentials(input);
  const existing = await getSandboxCredentialVault(input.providerSandboxId);
  if (!existing) {
    return postVault(input.providerSandboxId, { credentials, bindings: input.bindings });
  }
  const credentialsMutation = partitionByExistingName(
    credentials,
    new Set(existing.credentials.map(({ name }) => name))
  );
  const bindingsMutation = partitionByExistingName(
    input.bindings,
    new Set(existing.bindings.map(({ name }) => name))
  );
  return patchVault(input.providerSandboxId, {
    expectedRevision: existing.revision,
    credentials: mutationEntries(credentialsMutation),
    bindings: mutationEntries(bindingsMutation)
  });
};

export const deleteSandboxCredentialVaultEntries = async (input: RuntimeCredentialVaultDeleteInput) => {
  const existing = await getSandboxCredentialVault(input.providerSandboxId);
  if (!existing) return null;
  return patchVault(input.providerSandboxId, {
    expectedRevision: existing.revision,
    credentials: { delete: input.credentialNames },
    bindings: { delete: input.bindingNames }
  });
};
