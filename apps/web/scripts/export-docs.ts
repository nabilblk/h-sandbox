import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documentationAssets } from "../src/docs-export.js";

const output = fileURLToPath(new URL("../public/", import.meta.url));
const assets = documentationAssets();
const inventory = path.join(output, "docs/index.json");
try {
  const previous: { id: string }[] = JSON.parse(await fs.readFile(inventory, "utf8"));
  for (const { id } of previous) {
    // Delete only obsolete pages owned by the previous generated inventory.
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && !assets.has(`docs/${id}.md`)) {
      await fs.rm(path.join(output, `docs/${id}.md`), { force: true });
    }
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
for (const [filename, content] of assets) {
  const target = path.join(output, filename);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}
console.log("Generated Markdown and documentation indexes from the public page inventory.");
