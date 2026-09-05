import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function createDemoServer({ run = 'local-preview', template = 'open-agents-dev', startedAt = new Date().toISOString() } = {}) {
  const state = { run, template, startedAt };
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (path === '/health' || path === '/state') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ status: 'ok', ...state }));
      console.log(`${request.method} ${path} 200`);
      return;
    }
    if (path !== '/' && path !== '/mark.svg') {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      const file = path === '/' ? 'index.html' : 'mark.svg';
      const content = await readFile(new URL(file, import.meta.url));
      response.setHeader('Content-Type', path === '/' ? 'text/html; charset=utf-8' : 'image/svg+xml');
      response.end(content);
      console.log(`${request.method} ${path} 200`);
    } catch {
      response.writeHead(500).end('Application asset missing');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createDemoServer({ run: process.env.DEMO_RUN, template: process.env.DEMO_TEMPLATE });
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, '0.0.0.0', () => console.log(`Harakiri demo listening on 0.0.0.0:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
}
