import assert from "node:assert/strict";
import test from "node:test";
import {
  createCredentialInputsFromSpecs,
  createCredentialsFromSpecs,
  credentialProfileFromOptions,
  secretFromOptions
} from "./commands/credential-options.js";

test("credentialProfileFromOptions parses built-in and private API profiles", () => {
  assert.deepEqual(credentialProfileFromOptions({ preset: "openai" }), {
    providerPresetId: "openai"
  });
  assert.deepEqual(credentialProfileFromOptions({
    host: "api.internal.example",
    auth: "api-key",
    header: "x-service-key",
    method: ["GET", "POST"],
    path: ["/v1/*"],
    envName: "INTERNAL_API_KEY",
    testPath: "/health"
  }), {
    providerPresetId: "custom",
    customProfile: {
      host: "api.internal.example",
      authType: "apiKey",
      headerName: "x-service-key",
      methods: ["GET", "POST"],
      paths: ["/v1/*"],
      envName: "INTERNAL_API_KEY",
      testPath: "/health"
    }
  });
});

test("credentialProfileFromOptions rejects ambiguous and incomplete private API profiles", () => {
  assert.throws(
    () => credentialProfileFromOptions({ preset: "openai", host: "api.internal.example" }),
    /either --preset or private API profile options/
  );
  assert.throws(
    () => credentialProfileFromOptions({ host: "api.internal.example", auth: "api-key" }),
    /requires --header/
  );
  assert.throws(
    () => credentialProfileFromOptions({ auth: "bearer" }),
    /require --host/
  );
  assert.throws(
    () => credentialProfileFromOptions({}, true),
    /credential profile is required/
  );
});

test("secretFromOptions reads an explicit hidden prompt source", async () => {
  const value = await secretFromOptions({ prompt: true }, { prompt: async () => "prompt-secret" });
  assert.equal(value, "prompt-secret");
});

test("secretFromOptions rejects conflicting secret sources", async () => {
  await assert.rejects(
    () => secretFromOptions({ fromEnv: "OPENAI_API_KEY", prompt: true }, { prompt: async () => "prompt-secret" }),
    /choose only one of --from-env, --from-stdin, or --prompt/
  );
});

test("secretFromOptions rejects empty prompt values", async () => {
  await assert.rejects(
    () => secretFromOptions({ prompt: true }, { prompt: async () => "" }),
    /prompt did not contain a credential value/
  );
});

test("createCredentialsFromSpecs parses stored secret references", async () => {
  const credentials = await createCredentialsFromSpecs(["secret-id=vlt_openai,name=openai-prod"]);
  assert.deepEqual(credentials, [{
    sourceType: "harakiri_encrypted",
    secretId: "vlt_openai",
    displayName: "openai-prod",
    credentialName: undefined,
    bindingName: undefined
  }]);
});

test("createCredentialsFromSpecs parses external secret references", async () => {
  const credentials = await createCredentialsFromSpecs(["reference-id=xsr_openai,name=openai-cluster"]);
  assert.deepEqual(credentials, [{
    sourceType: "external_ref",
    referenceId: "xsr_openai",
    displayName: "openai-cluster",
    credentialName: undefined,
    bindingName: undefined
  }]);
});

test("createCredentialsFromSpecs parses dynamic credential issuers", async () => {
  const credentials = await createCredentialsFromSpecs(["issuer-id=dci_github,name=github-jit"]);
  assert.deepEqual(credentials, [{
    sourceType: "dynamic",
    issuerId: "dci_github",
    displayName: "github-jit",
    credentialName: undefined,
    bindingName: undefined
  }]);
});

test("createCredentialInputsFromSpecs parses stored template slot mappings", async () => {
  const inputs = await createCredentialInputsFromSpecs(["slot=llm,secret-id=vlt_openai,name=openai-prod"]);
  assert.deepEqual(inputs, {
    credentials: [],
    credentialMappings: [{
      slotId: "llm",
      providerPresetId: undefined,
      source: {
        sourceType: "harakiri_encrypted",
        secretId: "vlt_openai",
        displayName: "openai-prod",
        credentialName: undefined,
        bindingName: undefined
      }
    }]
  });
});

test("createCredentialInputsFromSpecs maps template slots to external references", async () => {
  const inputs = await createCredentialInputsFromSpecs(["slot=llm,reference-id=xsr_openai"]);
  assert.deepEqual(inputs.credentialMappings[0], {
    slotId: "llm",
    providerPresetId: undefined,
    source: {
      sourceType: "external_ref",
      referenceId: "xsr_openai",
      displayName: undefined,
      credentialName: undefined,
      bindingName: undefined
    }
  });
});

test("createCredentialInputsFromSpecs maps template slots to dynamic issuers", async () => {
  const inputs = await createCredentialInputsFromSpecs(["slot=git,issuer-id=dci_github"]);
  assert.deepEqual(inputs.credentialMappings[0], {
    slotId: "git",
    providerPresetId: undefined,
    source: {
      sourceType: "dynamic",
      issuerId: "dci_github",
      displayName: undefined,
      credentialName: undefined,
      bindingName: undefined
    }
  });
});

test("createCredentialInputsFromSpecs parses inline template slot mappings", async () => {
  process.env.HARAKIRI_TEST_OPENAI = "sk_slot_secret";
  try {
    const inputs = await createCredentialInputsFromSpecs([
      "slot-preset=openai,name=openai-dev,from-env=HARAKIRI_TEST_OPENAI,fake-env=OPENAI_API_KEY=fake-openai-key"
    ]);
    assert.deepEqual(inputs, {
      credentials: [],
      credentialMappings: [{
        slotId: undefined,
        providerPresetId: "openai",
        source: {
          sourceType: "inline_ephemeral",
          displayName: "openai-dev",
          credentialName: undefined,
          bindingName: undefined,
          value: "sk_slot_secret",
          fakeEnv: { OPENAI_API_KEY: "fake-openai-key" }
        }
      }]
    });
  } finally {
    delete process.env.HARAKIRI_TEST_OPENAI;
  }
});

test("createCredentialsFromSpecs rejects slot mappings outside sandbox creation", async () => {
  await assert.rejects(
    () => createCredentialsFromSpecs(["slot=llm,secret-id=vlt_openai"]),
    /slot credentials can only be used during sandbox creation/
  );
});

test("createCredentialsFromSpecs rejects ambiguous stored secret references", async () => {
  await assert.rejects(
    () => createCredentialsFromSpecs(["secret-id=vlt_openai,preset=openai"]),
    /cannot also set preset/
  );
  await assert.rejects(
    () => createCredentialsFromSpecs(["secret-id=vlt_openai,from-env=OPENAI_API_KEY"]),
    /cannot set from-env/
  );
  await assert.rejects(
    () => createCredentialsFromSpecs(["secret-id=vlt_openai,reference-id=xsr_openai"]),
    /choose only one of secret-id, reference-id, or issuer-id/
  );
  await assert.rejects(
    () => createCredentialsFromSpecs(["reference-id=xsr_openai,from-env=OPENAI_API_KEY"]),
    /resolve externally and cannot set from-env/
  );
  await assert.rejects(
    () => createCredentialsFromSpecs(["issuer-id=dci_github,from-env=GITHUB_TOKEN"]),
    /minted dynamically and cannot set from-env/
  );
});

test("createCredentialInputsFromSpecs rejects low-level binding keys on slot mappings", async () => {
  await assert.rejects(
    () => createCredentialInputsFromSpecs(["slot=llm,host=api.openai.com,from-env=OPENAI_API_KEY"]),
    /cannot set host/
  );
  await assert.rejects(
    () => createCredentialInputsFromSpecs(["slot=llm,preset=openai,from-env=OPENAI_API_KEY"]),
    /cannot also set preset/
  );
});
