DELETE FROM api_keys
WHERE key_hash = encode(digest('hk_live_demo_lyra_labs_0000000000000000000000000000000000', 'sha256'), 'hex')
   OR prefix = 'hk_live_dem';

DELETE FROM sandboxes
WHERE opensandbox_id IS NULL
   OR id IN ('sbx_jt29kf01x4', 'sbx_b8m4qa3eyl', 'sbx_p0w2rmnk7c', 'sbx_98aa1cvz4t', 'sbx_qq77dolfes');

DELETE FROM organizations
WHERE slug = 'lyra-labs';

DELETE FROM users
WHERE email = 'lyra@k.ai';
