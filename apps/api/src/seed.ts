import { hashApiKey } from "./crypto.js";
import { closeDb, query } from "./db.js";
import { migrate } from "./migrate.js";

export const localDevApiKey = "hk_live_demo_lyra_labs_0000000000000000000000000000000000";

export const seed = async () => {
  await migrate();
  const templates = await query<{ count: number }>("SELECT count(*)::int AS count FROM templates");
  const user = await query<{ id: string }>(
    `INSERT INTO users (email, full_name, keycloak_subject)
     VALUES ('lyra@k.ai', 'Lyra Ito', 'local-lyra')
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           keycloak_subject = EXCLUDED.keycloak_subject,
           updated_at = now()
     RETURNING id`
  );
  const org = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug, default_template_id, idle_ttl_seconds, max_concurrency)
     VALUES ('Lyra Labs', 'lyra-labs', 'python-3.12-data', 300, 200)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           default_template_id = EXCLUDED.default_template_id,
           idle_ttl_seconds = EXCLUDED.idle_ttl_seconds,
           max_concurrency = EXCLUDED.max_concurrency,
           updated_at = now()
     RETURNING id`
  );
  await query(
    `INSERT INTO memberships (user_id, organization_id, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [user.rows[0].id, org.rows[0].id]
  );
  await query(
    `INSERT INTO api_keys (organization_id, name, key_hash, prefix, last_four)
     VALUES ($1, 'local-dev-demo', $2, $3, $4)
     ON CONFLICT (key_hash) DO UPDATE
       SET organization_id = EXCLUDED.organization_id,
           name = EXCLUDED.name,
           prefix = EXCLUDED.prefix,
           last_four = EXCLUDED.last_four,
           revoked_at = NULL`,
    [org.rows[0].id, hashApiKey(localDevApiKey), localDevApiKey.slice(0, 12), localDevApiKey.slice(-4)]
  );
  console.log(`seeded local development workspace; template catalog contains ${templates.rows[0].count} templates`);
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
