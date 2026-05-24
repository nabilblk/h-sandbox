import assert from "node:assert/strict";
import test from "node:test";
import { commandToEntrypoint, parseHarakiriTemplateConfig } from "./template-config.js";

test("parseHarakiriTemplateConfig maps e2b-like template metadata", () => {
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
    readyCommand: "true"
  });
});

test("commandToEntrypoint splits simple quoted shell commands", () => {
  assert.deepEqual(commandToEntrypoint("python -m http.server \"8000\""), ["python", "-m", "http.server", "8000"]);
  assert.deepEqual(commandToEntrypoint(undefined), ["sleep", "3600"]);
});
