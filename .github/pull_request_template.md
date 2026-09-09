## Summary

## Testing

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm openapi:check` when API contracts changed
- [ ] relevant smoke/e2e command when runtime behavior changed
- [ ] `node --test scripts/check-secrets.test.mjs` and `pnpm security:scan` when publication inputs changed (Gitleaks 8.30.1)

List commands actually run and any skipped checks with reasons. Fixture-based
tests are not proof of native runtime or clean-install acceptance.

## Interface Impact

- [ ] API
- [ ] CLI
- [ ] SDK
- [ ] Web UI
- [ ] Docs only

## Notes

Call out version/support changes, migration or recovery implications, and any
new third-party material. Do not include raw secrets or private test evidence.
