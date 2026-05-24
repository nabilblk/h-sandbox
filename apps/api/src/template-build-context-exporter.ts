import { closeDb, query } from "./db.js";
import { extractTarGzipBuildContext, sha256Digest } from "./build-context.js";

const buildId = process.env.TEMPLATE_BUILD_ID;
const contextDir = process.env.TEMPLATE_CONTEXT_DIR ?? "/workspace/context";

if (!buildId) {
  console.error("TEMPLATE_BUILD_ID is required");
  process.exit(2);
}

try {
  const result = await query<{ archive: Buffer; sha256: string }>(
    "SELECT archive, sha256 FROM template_build_contexts WHERE build_id = $1",
    [buildId]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`build context not found for ${buildId}`);
  const actual = sha256Digest(row.archive);
  if (actual !== row.sha256) throw new Error(`stored build context digest mismatch for ${buildId}: ${actual} != ${row.sha256}`);
  const extracted = await extractTarGzipBuildContext(row.archive, contextDir);
  console.log(`exported build context ${row.sha256} to ${contextDir} (${extracted.files} files)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await closeDb();
}
