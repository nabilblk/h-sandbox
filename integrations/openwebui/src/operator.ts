import { parseArgs } from "node:util";
import { HarakiriClient } from "@h-sandbox/sdk";
import { Pool } from "pg";
import { BindingCipher, PostgresBindings } from "./bindings.js";
import { AdapterError, readConfig } from "./config.js";
import { identityFor } from "./identity.js";
import { bindingSummary, resetServiceGrant } from "./recovery.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "user-id": { type: "string" }, "expect-generation": { type: "string" } }
});
const [action] = positionals;
if (
  positionals.length !== 1 ||
  !["inspect", "reset-grant"].includes(action ?? "") ||
  !values["user-id"] ||
  (action === "reset-grant" && !values["expect-generation"])
) {
  console.error("Usage: operator.js inspect --user-id ID | reset-grant --user-id ID --expect-generation UUID");
  process.exit(2);
}
const config = readConfig();
const identity = identityFor(config.ADAPTER_INSTANCE_ID, { "x-user-id": values["user-id"] });
const pool = new Pool({
  connectionString: config.ADAPTER_DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000
});
const store = new PostgresBindings(pool, new BindingCipher(Buffer.from(config.ADAPTER_ENCRYPTION_KEY, "hex")));
try {
  const binding = await store.inspect(identity.bindingKey);
  if (!binding) throw new AdapterError(404, "binding_not_found");
  const result =
    action === "inspect"
      ? bindingSummary(binding)
      : await resetServiceGrant(
          new HarakiriClient({ apiUrl: config.HARAKIRI_API_URL, apiKey: config.HARAKIRI_API_KEY }),
          store,
          identity.bindingKey,
          values["expect-generation"]!,
          AbortSignal.timeout(30000)
        );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof AdapterError ? error.code : "Operator request failed; inspect before retrying.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
