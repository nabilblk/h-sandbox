import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, promisify } from "node:util";

// Read-only inventory. No docker socket, image execution or credentials required.
const execute = promisify(execFile);
const { values } = parseArgs({ options: {
  output: { type: "string", default: "docs/artifacts/observability-image-audit" },
  platform: { type: "string", default: "linux/amd64" }
} });
if (!["linux/amd64", "linux/arm64"].includes(values.platform)) throw new Error("Unsupported audit platform");
const images = JSON.parse(await readFile(new URL("./images.json", import.meta.url), "utf8"));
const directory = resolve(values.output);
await mkdir(directory, { recursive: true, mode: 0o700 });
const scanner = (await execute("grype", ["version", "-o", "json"])).stdout;
const receipt = { date: new Date().toISOString(), scanner: JSON.parse(scanner), hostArchitecture: process.arch,
  scannedPlatform: values.platform, threshold: "high", status: "passed", images: [] };
for (const [component, image] of Object.entries(images)) {
  if (!/@sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Image is not digest pinned");
  const output = resolve(directory, `${component}.json`);
  await execute("grype", [`registry:${image}`, "--platform", values.platform, "-o", "json", "--file", output], {
    timeout: 300_000, maxBuffer: 1024 * 1024
  });
  const inventory = JSON.parse(await readFile(output, "utf8"));
  const matches = inventory.matches.map(({ vulnerability, artifact }) => ({
    id: vulnerability.id, severity: vulnerability.severity, package: artifact.name,
    version: artifact.version, fixedIn: vulnerability.fix?.versions ?? [],
    fixState: vulnerability.fix?.state ?? "unknown"
  }));
  receipt.images.push({ component, image, matches, db: inventory.descriptor?.db });
  if (matches.some((match) => ["High", "Critical"].includes(match.severity))) receipt.status = "failed";
  console.log(`${component}: ${matches.length} advisory matches (${matches.filter((match) => ["High", "Critical"].includes(match.severity)).length} high/critical)`);
}
await writeFile(resolve(directory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
console.log(`Inventory saved in ${directory}; findings require review, not automatic exceptions.`);
if (receipt.status === "failed") process.exitCode = 1;
