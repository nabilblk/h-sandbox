import { createHash, randomBytes, randomUUID } from "node:crypto";
import { literalId, query } from "../acceptance/operator.mjs";

// Seed a second identity, not a runtime. Every runtime access under test uses the API.
export function foreignPrincipal(ctx) {
  ctx.guard();
  const organization = randomUUID(), user = randomUUID(), id = randomUUID();
  const token = `hk_test_${randomBytes(28).toString("base64url")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  query(ctx, `BEGIN;
    INSERT INTO organizations (id, name, slug)
      VALUES (${literalId(organization)}, 'Python foreign fixture', 'python-${organization}');
    INSERT INTO users (id, email, full_name)
      VALUES (${literalId(user)}, '${user}@example.invalid', 'Python foreign fixture');
    INSERT INTO memberships (user_id, organization_id, role)
      VALUES (${literalId(user)}, ${literalId(organization)}, 'member');
    INSERT INTO api_keys (id, organization_id, name, key_hash, prefix, last_four,
                         created_by_user_id, scopes, expires_at, legacy)
      VALUES (${literalId(id)}, ${literalId(organization)}, 'Python foreign fixture',
              ${literalId(hash)}, ${literalId(token.slice(0, 12))}, ${literalId(token.slice(-4))},
              ${literalId(user)}, ARRAY['sandboxes:read', 'sandboxes:write'],
              now() + interval '1 hour', false);
    COMMIT;`);
  return { id, token };
}

export function revokeForeignPrincipal(ctx, id) {
  ctx.guard();
  query(ctx, `UPDATE api_keys SET revoked_at = now() WHERE id = ${literalId(id)};`);
}
