import fs from "node:fs";
import { context } from "../acceptance/context.mjs";
import { runnerIdentity } from "../acceptance/safety.mjs";
import { cleanupDocker } from "./stack.mjs";

// This runs before shared cluster cleanup, including after a job timeout.
const identity = runnerIdentity();
if (fs.existsSync(identity.directory) && fs.existsSync(`${identity.directory}/cluster.json`)) {
  cleanupDocker(context());
}
