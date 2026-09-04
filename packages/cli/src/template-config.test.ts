import assert from "node:assert/strict";
import test from "node:test";
import { commandToEntrypoint, parseHarakiriTemplateConfig } from "./template-config.js";

test("parseHarakiriTemplateConfig maps Harakiri template metadata", () => {
  const config = parseHarakiriTemplateConfig(`
name = "open-agents-dev"
id = "open-agents-dev"
dockerfile = "Dockerfile"
visibility = "internal"
runtime_family = "browser"
cpu_count = 2
memory_mb = 2048
workdir = "/workspace"
ports = [3000, 5173, 4321, 8000]
aliases = ["open-agents-dev", "agents/open-agents-dev"]
tags = ["custom", "hot"]
start_command = "sleep 3600"
ready_command = "true"
credential_slots = ["openai", "github"]
optional_credential_slots = ["npm"]
`);

  assert.deepEqual(config, {
    id: "open-agents-dev",
    name: "open-agents-dev",
    dockerfile: "Dockerfile",
    visibility: "internal",
    runtimeFamily: "browser",
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/workspace",
    ports: [3000, 5173, 4321, 8000],
    aliases: ["open-agents-dev", "agents/open-agents-dev"],
    tags: ["custom", "hot"],
    startCommand: "sleep 3600",
    readyCommand: "true",
    credentialSlots: [
      { providerPresetId: "openai", required: true },
      { providerPresetId: "github", required: true },
      { providerPresetId: "npm", required: false }
    ]
  });
});

test("parseHarakiriTemplateConfig keeps hashes in quoted values and strips trailing comments", () => {
  const config = parseHarakiriTemplateConfig(`
name = "open-agents-dev" # template name
description = "agent runtime #1"
image = "ghcr.io/acme/open-agents:dev#sha-note"
ports = [3000, 5173] # public preview ports
tags = ["custom#tag", "hot"]
`);

  assert.equal(config.name, "open-agents-dev");
  assert.equal(config.description, "agent runtime #1");
  assert.equal(config.image, "ghcr.io/acme/open-agents:dev#sha-note");
  assert.deepEqual(config.ports, [3000, 5173]);
  assert.deepEqual(config.tags, ["custom#tag", "hot"]);
});

test("parseHarakiriTemplateConfig rejects unknown credential slot presets", () => {
  assert.throws(
    () => parseHarakiriTemplateConfig('credential_slots = ["unknown-provider"]'),
    /unknown credential provider preset/
  );
});

test("parseHarakiriTemplateConfig maps custom credential slots and egress policy", () => {
  const config = parseHarakiriTemplateConfig(`
name = "private-api-runner"
egress_mode = "restricted"
egress_presets = ["git-hosting"]
egress_allow = ["api.internal.example"]

[[credential_slot]]
id = "internal-api"
provider = "custom"
required = true
label = "Internal API"
host = "api.internal.example"
auth = "api-key"
header = "x-service-key"
methods = ["GET", "POST"]
paths = ["/v1/*"]
env_name = "INTERNAL_API_KEY"
test_path = "/health"
`);

  assert.deepEqual(config.egressPolicy, {
    mode: "restricted",
    presets: ["git-hosting"],
    allow: ["api.internal.example"],
    deny: undefined,
    defaultAction: undefined
  });
  assert.deepEqual(config.credentialSlots, [{
    id: "internal-api",
    providerPresetId: "custom",
    required: true,
    label: "Internal API",
    description: undefined,
    envName: "INTERNAL_API_KEY",
    customProfile: {
      host: "api.internal.example",
      authType: "apiKey",
      headerName: "x-service-key",
      methods: ["GET", "POST"],
      paths: ["/v1/*"],
      envName: "INTERNAL_API_KEY",
      testPath: "/health"
    }
  }]);
});

test("parseHarakiriTemplateConfig rejects malformed and incomplete custom slots", () => {
  assert.throws(
    () => parseHarakiriTemplateConfig('name = "unterminated'),
    /invalid harakiri\.toml/
  );
  assert.throws(
    () => parseHarakiriTemplateConfig(`
[[credential_slot]]
id = "internal-api"
provider = "custom"
host = "api.internal.example"
auth = "api-key"
`),
    /header is required/
  );
});

test("commandToEntrypoint splits simple quoted shell commands", () => {
  assert.deepEqual(commandToEntrypoint("python -m http.server \"8000\""), ["python", "-m", "http.server", "8000"]);
  assert.deepEqual(commandToEntrypoint(undefined), ["sleep", "3600"]);
});
