import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { openApiJson } from "../src/openapi.js";

const targetPath = fileURLToPath(new URL("../../../docs/openapi.json", import.meta.url));
const expected = openApiJson();
const check = process.argv.includes("--check");

if (check) {
  const current = await readFile(targetPath, "utf8").catch(() => "");
  if (current !== expected) {
    console.error(`${targetPath} is stale. Run "pnpm openapi:write".`);
    process.exit(1);
  }
  process.exit(0);
}

await writeFile(targetPath, expected);
