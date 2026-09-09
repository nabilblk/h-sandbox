import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './io.js';
import { agentDemoTutorials } from '../../web/src/agent-demo-tutorials.js';

export async function writeDemoIndex() {
  const tutorials = [{ id: 'ui-product-tour', title: 'UI tour: the Harakiri dashboard' }, ...agentDemoTutorials];
  await writeFile(join(root, 'apps/web/public/demos/index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harakiri demos</title><style>body{margin:0;background:#fafafa;color:#171917;font:16px/1.6 system-ui}main{max-width:960px;margin:auto;padding:48px 24px}h1{font-size:32px}a{color:#a52b20}li{margin:18px 0}</style><main><h1>Harakiri demos</h1><p>Full UI product tour and real CLI, UI and SDK agent workflows.</p><ul>${tutorials.map(t => `<li><a href="${t.id}/tutorial.html">${t.title}</a></li>`).join('')}</ul><a href="/#demos">Interactive demo library</a></main></html>\n`);
}
