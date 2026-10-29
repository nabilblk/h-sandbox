import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { BindingCipher, PostgresBindings } from "./bindings.js";

const database = process.env.OPENWEBUI_TEST_DATABASE_URL;
if (process.env.OPENWEBUI_TEST_REQUIRED === "1" && !database) throw new Error("Required adapter database is missing");

test(
  "PostgreSQL serializes two adapter replicas and preserves encrypted intent across failure",
  { skip: !database },
  async (t) => {
    const pool = new Pool({
      connectionString: database,
      max: 8,
      connectionTimeoutMillis: 1000,
      statement_timeout: 2000
    });
    t.after(() => pool.end());
    const key = randomBytes(32);
    const first = new PostgresBindings(pool, new BindingCipher(key));
    const second = new PostgresBindings(pool, new BindingCipher(key));
    await Promise.all([first.migrate(), second.migrate()]);
    const identity = randomBytes(32).toString("hex");
    assert.equal(await first.inspect(identity), null);
    assert.equal((await pool.query("SELECT identity FROM openwebui_bindings WHERE identity = $1", [identity])).rowCount, 0);
    let allocations = 0;
    const observed = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? first : second).withBinding(identity, async (binding, save) => {
          if (!binding.sandboxId) {
            allocations++;
            binding.sandboxId = "sbx_owned";
            await save(binding);
          }
          return binding.generation;
        })
      )
    );
    assert.equal(allocations, 1);
    assert.equal(new Set(observed).size, 1);
    await assert.rejects(
      first.withBinding(identity, async (binding, save) => {
        binding.routeIntent = true;
        await save(binding);
        throw new Error("response lost after intent");
      }),
      /response lost/
    );
    const recovered = await second.withBinding(identity, async (binding) => binding);
    assert.equal(recovered.routeIntent, true);
    assert.equal(recovered.sandboxId, "sbx_owned");
    assert.deepEqual(await second.inspect(identity), recovered);
    const row = await pool.query<{ payload: Buffer }>("SELECT payload FROM openwebui_bindings WHERE identity = $1", [
      identity
    ]);
    assert.equal(row.rows[0].payload.includes(Buffer.from(recovered.serviceKey)), false);
    const wrongKey = new PostgresBindings(pool, new BindingCipher(randomBytes(32)));
    await assert.rejects(
      wrongKey.withBinding(identity, async () => {}),
      /binding_decryption_failed/
    );
    assert.equal((await second.withBinding(identity, async (binding) => binding)).generation, observed[0]);
  }
);

test(
  "an interrupted advisory-lock waiter does not leave a lock or allocate a binding",
  { skip: !database },
  async (t) => {
    const pool = new Pool({
      connectionString: database,
      max: 4,
      connectionTimeoutMillis: 1000,
      statement_timeout: 2000
    });
    t.after(() => pool.end());
    const store = new PostgresBindings(pool, new BindingCipher(randomBytes(32)));
    await store.migrate();
    const identity = randomBytes(32).toString("hex");
    let unlock = () => {};
    let entered = () => {};
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = store.withBinding(identity, async () => {
      entered();
      await new Promise<void>((resolve) => {
        unlock = resolve;
      });
    });
    try {
      await ready;
      const controller = new AbortController();
      const waiting = store.withBinding(
        identity,
        async () => {
          throw new Error("must not enter");
        },
        controller.signal
      );
      const rejection = assert.rejects(waiting, /abort/i);
      controller.abort();
      await rejection;
    } finally {
      unlock();
      await held;
    }
    await store.withBinding(identity, async (binding) => {
      assert.ok(binding.generation);
    });
  }
);
