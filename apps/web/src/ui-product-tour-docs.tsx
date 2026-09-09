import type { DocPage } from './docs-content';
import { CodeBlock } from './components/docs-code';
import { uiProductTourChapters } from './ui-product-tour';

export const uiProductTourDocs: DocPage = {
  id: 'ui-product-tour', section: 'Getting started', navTitle: 'UI product tour', title: 'UI tour: the Harakiri dashboard',
  lede: 'Follow one project through the full UI: a new environment, real work, a running preview, network policy, and files that survive a replacement sandbox.',
  toc: ['Before you begin', 'Prepare the example', ...uiProductTourChapters.map(c => c.title), 'Boundaries and next steps'],
  body: <div className="tutorial-doc">
    <p><a href="#demos/ui-product-tour">Watch the full UI tour</a> | <a href="/demos/ui-product-tour/example-source.zip">Download the example</a> | <a href="/demos/ui-product-tour/transcript.md">Read the transcript</a></p>
    <h2>Before you begin</h2>
    <p>Sign in to your Harakiri organization. This example needs a ready Node 20 template, permission to create sandboxes and workspaces, configured persistent storage, route exposure, and mutable outbound policy support. The recording uses an isolated lab organization with synthetic files. It makes no model calls. Your installation may use different storage sizes or expose fewer runtime capabilities.</p>
    <p>The film preserves the entire 1920x1080 application viewport at normal browser zoom. Browser chrome is not recorded. The guide below the video follows each chapter; native captions are optional. Provisioning and storage-release waits between chapters are edited, but interactions are not accelerated.</p>
    <h2>Prepare the example</h2>
    <p>Download and extract the four example files. After creating the first sandbox, upload them to <code>/workspace</code> through Harakiri's CLI or SDK file API. The recording does this after the terminal chapter. The minimal Node template also needs curl and certificate roots for the built-in connectivity test; their installation is shown explicitly in Commands, using the included shell script.</p>
    <CodeBlock language="bash">{'harakiri file-upload <sandbox-id> --from ./README.md --path /workspace/README.md --parents\nharakiri file-upload <sandbox-id> --from ./check.mjs --path /workspace/check.mjs --parents\nharakiri file-upload <sandbox-id> --from ./server.mjs --path /workspace/server.mjs --parents\nharakiri file-upload <sandbox-id> --from ./prepare-tools.sh --path /workspace/prepare-tools.sh --parents'}</CodeBlock>
    {uiProductTourChapters.map(chapter => <section key={chapter.id}>
      <h2>{chapter.title}</h2><p>{chapter.guide}</p>
      {chapter.id === 'commands' ? <CodeBlock language="bash">{'node check.mjs'}</CodeBlock> : null}
      {chapter.id === 'tools' ? <CodeBlock language="bash">{'sh prepare-tools.sh'}</CodeBlock> : null}
      {chapter.id === 'server' ? <CodeBlock language="bash">{'node server.mjs'}</CodeBlock> : null}
      {chapter.id === 'verify' ? <CodeBlock language="bash">{`node -e 'const r=require("./report.json");if(r.results.length!==3||!r.results.every(x=>x.passed))process.exit(1);console.log("Retained report: 3 checks passed")'`}</CodeBlock> : null}
      <div className="tutorial-check"><b>Verify</b><p>{chapter.outcome}</p></div>
    </section>)}
    <h2>Boundaries and next steps</h2>
    <p>A persistent workspace retains files, not live processes, command history, open connections, or the complete VM. Archive retains storage until an operator reclaims it. CPU and memory panels show runtime snapshots, not billing history. A public route exposes its content to anyone who has its URL. Use only the synthetic example when following this exact tour.</p>
    <p>The capture uses Harakiri's current OpenSandbox adapter, through the control plane. It does not use Kubernetes exec or imply that other adapters are implemented. The product contract covers identity, templates, workspace attachment, lifecycle and access policy; runtime capabilities remain explicit.</p>
    <p>Continue with <a href="#docs/workspaces">Workspaces</a>, <a href="#docs/outbound-access">Outbound access</a>, <a href="#docs/authorization">Authorization</a>, or <a href="#demos/ui-agent-app">the OpenCode UI workflow</a>. The separate CLI and SDK demos show real agent tasks on the same control plane.</p>
  </div>,
};
