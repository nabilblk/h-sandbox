import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { demoTutorialSections } from '../../web/src/demo-tutorial.js';

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function tutorialHtml() {
  const sections = demoTutorialSections.map((section) => `<section><h2>${escape(section.title)}</h2><p>${escape(section.text)}</p>${section.code ? `<pre><code>${escape(section.code)}</code></pre>` : ''}<p><strong>Verification:</strong> ${escape(section.check)}</p></section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CLI to live preview | Harakiri Sandbox</title><style>body{margin:0;background:#fafaf7;color:#0f0f0e;font:17px/1.6 system-ui}main{max-width:860px;margin:auto;padding:32px 24px}h1{font-size:36px;line-height:1.2}h2{font-size:24px;margin-top:40px}pre{overflow:auto;padding:20px;background:#fff;border:1px solid #d9d8d0;font-size:13px}a{color:#b8331f}video{width:100%;aspect-ratio:16/9}</style></head><body><main><a href="/">Harakiri Sandbox</a><h1>CLI to live preview</h1><video controls playsinline preload="none" poster="harakiri-product-demo.webp"><source src="harakiri-product-demo.mp4" type="video/mp4"><track kind="captions" src="harakiri-product-demo.vtt" srclang="en" label="English" default></video><p><a href="transcript.md">Transcript</a> | <a href="https://github.com/nabilblk/h-sandbox/tree/main/examples/demo/product-tour">Example source</a></p>${sections}</main></body></html>\n`;
}

export async function writeTutorial(directory: string) {
  await writeFile(join(directory, 'tutorial.html'), tutorialHtml());
}
