#!/usr/bin/env node
import { execFileSync } from "node:child_process";

if (process.env.HARAKIRI_ALLOW_DIRTY_PUBLISH === "1" || process.env.npm_config_dry_run === "true") {
  process.exit(0);
}

const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
if (status) {
  console.error("Refusing to publish from a dirty worktree. Commit or stash changes first.");
  console.error(status);
  process.exit(1);
}
