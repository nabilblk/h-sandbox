#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createConfiguration } from "./configuration.mjs";

const [inputPath, outputPath, ...extra] = process.argv.slice(2);
if (!inputPath || !outputPath || extra.length) {
  console.error("Usage: node configure.mjs operator-input.json NEW_OUTPUT_DIRECTORY\nWrites configuration only. Does not contact or modify a cluster.");
  process.exitCode = 1;
} else {
  try {
    const files = createConfiguration(JSON.parse(await readFile(inputPath, "utf8")));
    // Refuse existing destinations, including symlinks. Never overwrite an operator's configuration.
    await mkdir(outputPath, { mode: 0o700 });
    for (const [name, contents] of Object.entries(files)) {
      await writeFile(resolve(outputPath, name), `${JSON.stringify(contents, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    }
    console.log(`Generated ${Object.keys(files).length} reviewable files in ${resolve(outputPath)}. Native OpenShift validation is pending.`);
  } catch (error) {
    console.error(error instanceof SyntaxError ? "Invalid JSON input; file content is not printed" : error instanceof Error ? error.message : "Configuration failed");
    process.exitCode = 1;
  }
}
