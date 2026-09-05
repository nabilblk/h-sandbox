export const fps = 30;
export const fullDuration = 68;
export const heroDuration = 14;
export const chapters = [
  { start: 0, end: 4, scene: 'intro', title: 'Harakiri Sandbox', caption: 'From the CLI to a live application, then back to a clean workspace.' },
  { start: 4, end: 13, scene: 'create', title: 'Start with a template.', caption: 'Configure the published CLI and create an open-agents-dev sandbox with a five-minute TTL.' },
  { start: 13, end: 21, scene: 'attach', title: 'A real shell. Your workspace.', caption: 'Attach through Harakiri. Inspect the uploaded application in /workspace.' },
  { start: 21, end: 28, scene: 'start', title: 'Run your application.', caption: 'Upload the files and start a tracked background command on port 3000.' },
  { start: 28, end: 36, scene: 'expose', title: 'One command to a live URL.', caption: 'Expose port 3000 and wait for the application health endpoint to return HTTP 200.' },
  { start: 36, end: 40, scene: 'preview', title: 'Your code, served from the sandbox.', caption: 'The public route returns the application and the identifier of this capture run.' },
  { start: 40, end: 44, scene: 'terminal', title: 'The same sandbox in your browser.', caption: 'The dashboard terminal connects to the same running sandbox.' },
  { start: 44, end: 48, scene: 'files', title: 'Inspect the actual files.', caption: 'The Filesystem view shows the server, page, and logo uploaded through the CLI.' },
  { start: 48, end: 52, scene: 'logs', title: 'Follow the lifecycle.', caption: 'Logs display real control-plane lifecycle events with their source labels.' },
  { start: 52, end: 56, scene: 'metrics', title: 'See the runtime state.', caption: 'Metrics show the provider CPU and memory snapshot. This is not a performance benchmark.' },
  { start: 56, end: 60, scene: 'network', title: 'Keep routes in view.', caption: 'The Network view lists the exposed application port.' },
  { start: 60, end: 68, scene: 'cleanup', title: 'Done means cleaned up.', caption: 'Terminate the sandbox. This run verified a terminal state and that the public route was no longer active.' },
] as const;
export type Scene = typeof chapters[number]['scene'];
export const vtt = () => `WEBVTT\n\n${chapters.map(({ start, end, caption }) => `${timestamp(start)} --> ${timestamp(end)}\n${caption}\n`).join('\n')}`;
export const transcript = () => `# CLI to a live sandbox\n\nReal Harakiri CLI and dashboard capture. Waiting time is edited; no benchmark claims. Silent by design.\n\n${chapters.map(({ start, title, caption }) => `## ${timestamp(start).slice(3, 8)} - ${title}\n\n${caption}`).join('\n\n')}\n`;
function timestamp(seconds: number) { return `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.000`; }
