import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./browser-app.html', import.meta.url));
createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  } else if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  } else response.writeHead(404).end('Not found');
}).listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
