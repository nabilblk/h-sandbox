import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Exercise the same isolated production bundle as the final Docker stage.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "harakiri-openwebui-package-"));
try {
  execFileSync("pnpm", ["--filter", "@harakiri/openwebui-adapter", "build"], { cwd: root, stdio: "inherit" });
  // Legacy pnpm deploy records production-install state in its workspace.
  // Use a disposable source tree so that it cannot change the developer's install.
  const source = join(directory, "source");
  mkdirSync(source);
  for (const name of ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"])
    cpSync(join(root, name), join(source, name));
  for (const name of ["packages/sdk", "integrations/openwebui"]) {
    const manifest = JSON.parse(readFileSync(join(root, name, "package.json"), "utf8"));
    mkdirSync(join(source, name), { recursive: true });
    for (const entry of ["package.json", ...manifest.files])
      cpSync(join(root, name, entry), join(source, name, entry), { recursive: true });
  }
  execFileSync("pnpm", ["--filter", "@harakiri/openwebui-adapter", "deploy", "--legacy", "--prod", join(directory, "package")], { cwd: source, stdio: "inherit" });
  execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { readFileSync, readdirSync, existsSync } from "node:fs";
    import { routeWebSocketRequest } from "@h-sandbox/sdk";
    import { buildAdapter } from "./dist/app.js";
    assert.equal(typeof routeWebSocketRequest, "function");
    assert.equal(typeof buildAdapter, "function");
    assert.ok(JSON.parse(readFileSync("open-terminal.openapi.json")).paths);
    for (const path of ["src", "node_modules/tsx", "node_modules/typescript", ".env"])
      assert.equal(existsSync(path), false, path);
    assert.equal(readdirSync("dist").some(name => name.includes(".test.")), false);
    console.log("Isolated production adapter imports its SDK and schema without development sources or tooling.");
  `], { cwd: join(directory, "package"), stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
