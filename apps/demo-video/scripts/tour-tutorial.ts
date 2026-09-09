import { uiProductTourChapters } from '../../web/src/ui-product-tour.js';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const commands: Record<string, string> = {
  tools: 'sh prepare-tools.sh', commands: 'node check.mjs', server: 'node server.mjs',
  verify: `node -e 'const r=require("./report.json");if(r.results.length!==3||!r.results.every(x=>x.passed))process.exit(1);console.log("Retained report: 3 checks passed")'`,
};

export function tourTutorialHtml() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI tour: the Harakiri dashboard</title>
<style>body{margin:0;background:#fafafa;color:#171917;font:16px/1.65 system-ui}main{max-width:1440px;margin:auto;padding:32px 24px 64px}h1{font-size:32px}h2{font-size:23px;margin-top:36px}a{color:#a52b20}p{max-width:960px;overflow-wrap:anywhere}video{width:100%;aspect-ratio:16/9;object-fit:contain}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:20px;color:#eef3f0;background:#191c1e;font:13px/1.7 monospace;border-radius:6px}.check{border-left:3px solid #267849;padding-left:16px}</style>
<main><nav><a href="/demos/index.html">Harakiri / Demos</a></nav><h1>UI tour: the Harakiri dashboard</h1>
<p>A real project from launch to cleanup, with the entire application viewport visible. Silent video, optional captions, no model calls.</p>
<video controls playsinline preload="metadata" poster="poster.webp"><source src="video.mp4" type="video/mp4"><track kind="captions" src="captions.vtt" srclang="en" label="English"></video>
<p><a href="example-source.zip">Download the example</a> | <a href="transcript.md">Transcript</a> | <a href="provenance.json">Capture details</a> | <a href="/docs/ui-product-tour.md">Full guide (Markdown)</a></p>
<h2>Before you begin</h2><p>Use an isolated organization with a ready Node 20 template, permission to create sandboxes and workspaces, persistent storage, preview routes and outbound enforcement. Your installation may expose different capacities or runtime capabilities. Package installation here uses a disposable root-capable Node template; use a prebuilt image on restricted non-root installations.</p>
<h2>Prepare the example</h2><p>Extract the four example files. After creating the first sandbox, upload them to /workspace through Harakiri. Upload happens between the terminal and tools chapters in the recording. Set the working directory to /workspace in Commands.</p>
<pre>${escape('for file in README.md check.mjs server.mjs prepare-tools.sh; do\n  harakiri file-upload <sandbox-id> --from "./$file" --path "/workspace/$file" --parents\ndone')}</pre>
${uiProductTourChapters.map(c => `<section><h2>${escape(c.title)}</h2><p>${escape(c.guide)}</p>${commands[c.id] ? `<pre>${escape(commands[c.id]!)}</pre>` : ''}<p class="check"><strong>Verify:</strong> ${escape(c.outcome)}</p></section>`).join('\n')}
<p><a href="/#demos/ui-product-tour">Interactive player and synchronized guide</a> | <a href="/demos/index.html">More CLI, UI and SDK workflows</a></p></main></html>\n`;
}
