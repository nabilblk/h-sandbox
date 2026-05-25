import { closeDb } from "./db.js";
import { extractTarGzipBuildContext, sha256Digest } from "./build-context.js";
import { PostgresTemplateBuildContextBlobStore } from "./storage/postgres-blob-store.js";

const buildId = process.env.TEMPLATE_BUILD_ID;
const contextDir = process.env.TEMPLATE_CONTEXT_DIR ?? "/workspace/context";

if (!buildId) {
  console.error("TEMPLATE_BUILD_ID is required");
  process.exit(2);
}

try {
  const context = await new PostgresTemplateBuildContextBlobStore().get({ store: "postgres", key: buildId });
  if (!context) throw new Error(`build context not found for ${buildId}`);
  const archive = Buffer.from(context.body);
  const actual = sha256Digest(archive);
  if (actual !== context.sha256) throw new Error(`stored build context digest mismatch for ${buildId}: ${actual} != ${context.sha256}`);
  const extracted = await extractTarGzipBuildContext(archive, contextDir);
  console.log(`exported build context ${context.sha256} to ${contextDir} (${extracted.files} files)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await closeDb();
}
