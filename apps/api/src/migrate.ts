import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query, closeDb } from "./db.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = join(repoRoot, "db/migrations");

export const migrate = async () => {
  await query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await query<{ id: string }>("SELECT id FROM schema_migrations WHERE id = $1", [file]);
    if (applied.rowCount) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await query("BEGIN");
    try {
      await query(sql);
      await query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await query("COMMIT");
      console.log(`applied ${file}`);
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => closeDb())
    .catch(async (error) => {
      console.error(error);
      await closeDb();
      process.exit(1);
    });
}
