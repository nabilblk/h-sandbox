INSERT INTO templates (id, name, description, image, icon, tags, boot_ms, visibility, default_entrypoint)
VALUES
  ('python-3.12', 'Python 3.12', 'Bare Python with pip + uv.', 'python:3.12-slim', 'py', ARRAY['python', 'cli'], 126, 'public', ARRAY['sleep', '3600']),
  ('python-3.12-data', 'Python 3.12 (data)', 'Numpy, pandas, polars, matplotlib.', 'python:3.12-slim', 'py', ARRAY['python', 'data'], 137, 'public', ARRAY['sleep', '3600']),
  ('node-20', 'Node 20', 'Node + pnpm + bun.', 'node:20-bookworm-slim', 'node', ARRAY['node', 'js'], 142, 'public', ARRAY['sleep', '3600']),
  ('node-20-chromium', 'Node 20 + Chromium', 'Headless browser for agents.', 'mcr.microsoft.com/playwright:v1.57.0-noble', 'globe', ARRAY['browser', 'node'], 184, 'public', ARRAY['sleep', '3600']),
  ('ubuntu-24.04', 'Ubuntu 24.04', 'Plain devbox, root, apt available.', 'ubuntu:24.04', 'box', ARRAY['os'], 119, 'public', ARRAY['sleep', '3600']),
  ('custom', 'Custom Dockerfile', 'Bring your own image.', 'ubuntu:24.04', 'file', ARRAY['custom'], 220, 'internal', ARRAY['sleep', '3600'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    image = EXCLUDED.image,
    icon = EXCLUDED.icon,
    tags = EXCLUDED.tags,
    boot_ms = EXCLUDED.boot_ms,
    visibility = EXCLUDED.visibility,
    default_entrypoint = EXCLUDED.default_entrypoint,
    updated_at = now();
