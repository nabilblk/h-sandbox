import { closeDb, query } from "./db.js";
import { migrate } from "./migrate.js";

export const seed = async () => {
  await migrate();
  const templates = await query<{ count: number }>("SELECT count(*)::int AS count FROM templates");
  console.log(`seed disabled; template catalog contains ${templates.rows[0].count} templates`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => closeDb())
    .catch(async (error) => {
      console.error(error);
      await closeDb();
      process.exit(1);
    });
}
