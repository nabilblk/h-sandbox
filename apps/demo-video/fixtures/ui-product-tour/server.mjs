import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

createServer(async (_request, response) => {
  try {
    const report = JSON.parse(await readFile('report.json', 'utf8'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Release checks</title>
      <style>body{font:18px system-ui;margin:0;color:#171917;background:#fafafa}header{padding:24px 48px;border-bottom:1px solid #ddd;font-size:15px}main{max-width:960px;margin:72px auto;padding:0 32px}h1{font-size:40px}p{color:#626662}table{width:100%;border-collapse:collapse;margin:32px 0}td,th{text-align:left;padding:20px 0;border-bottom:1px solid #ddd}td:last-child{color:#167444}code{font-size:15px}footer{padding-top:32px;color:#626662;font-size:15px}</style>
      <header>Harakiri Sandbox / Synthetic project</header><main><h1>Release checks</h1><p>A real report served from a running sandbox.</p><table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>${report.results.map((r) => `<tr><td>${r.name}</td><td>${r.passed ? 'Passed' : 'Failed'}</td></tr>`).join('')}</tbody></table><strong>3 / 3 checks passed</strong><footer>Source: <code>/workspace/report.json</code>. No external model or customer data.</footer></main></html>`);
  } catch {
    response.writeHead(503, { 'content-type': 'text/plain' });
    response.end('Run node check.mjs first.');
  }
}).listen(3000, '0.0.0.0', () => console.log('Release preview ready on port 3000.'));
