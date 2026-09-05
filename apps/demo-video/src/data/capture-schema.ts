import { z } from 'zod';

export const checkpointNames = ['preview', 'terminal', 'files', 'logs', 'metrics', 'network', 'terminated'] as const;
const finite = z.number().finite().nonnegative();
const id = z.string().regex(/^sbx_[a-zA-Z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const asset = z.string().regex(/^[a-z][a-z0-9-]*\.(webm|mp4|png|webp)$/);

export const captureSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal('live'),
  status: z.enum(['captured', 'verified']),
  publishable: z.boolean(),
  runId: z.string().regex(/^product-demo-[a-z0-9-]+$/),
  capturedAt: z.string().datetime(),
  cliVersion: z.string().regex(/^\d+\.\d+\.\d+([+-][a-zA-Z0-9.-]+)?$/),
  release: z.string().min(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  publicOrigins: z.array(z.string().url()).min(2),
  releaseEvidence: z.object({ apiSpecSha256: hash, webAssetSha256: hash }).strict(),
  sandbox: z.object({ id, template: z.string().min(1), version: z.string().min(1), status: z.literal('terminated'), ttl: z.number().int().min(60).max(1800) }).strict(),
  route: z.object({ url: z.string().url(), port: z.literal(3000), readyStatus: z.literal(200), runMatched: z.literal(true) }).strict(),
  events: z.array(z.object({
    name: z.string().min(1), command: z.string(), startedMs: finite, durationMs: finite,
    exitCode: z.literal(0), stdout: z.string(), stderr: z.string(),
  }).strict()).min(8),
  terminal: z.object({ command: z.string(), stdout: z.string().min(1), chunks: z.array(z.object({ atMs: finite, text: z.string() }).strict()).min(1), exitCode: z.literal(0) }).strict(),
  checkpoints: z.array(z.object({
    name: z.enum(checkpointNames), sandboxId: id, assertion: z.string().min(1), atMs: finite,
    image: asset, imageSha256: hash, video: asset, videoSha256: hash, durationMs: finite,
    recording: z.object({ source: z.literal('cdp-screencast'), frameCount: z.number().int().positive(), startedAt: z.string().datetime(), endedAt: z.string().datetime() }).strict(),
    crop: z.object({ x: finite, y: finite, width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  }).strict()).length(checkpointNames.length),
  cleanup: z.object({ status: z.literal('complete'), sandboxTerminal: z.literal(true), routeInactive: z.literal(true), containerRemoved: z.literal(true), completedAt: z.string().datetime() }).strict(),
  review: z.object({ reviewedAt: z.string().datetime(), reviewer: z.string().min(1), manifestSha256: hash }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const names = value.checkpoints.map((item) => item.name);
  if (new Set(names).size !== checkpointNames.length) ctx.addIssue({ code: 'custom', message: 'Every required UI checkpoint must appear exactly once' });
  if (value.checkpoints.some((point) => point.sandboxId !== value.sandbox.id)) ctx.addIssue({ code: 'custom', message: 'All checkpoints must show the same sandbox' });
  if (value.publishable && (value.status !== 'verified' || !value.review)) ctx.addIssue({ code: 'custom', message: 'Publication requires verified capture and visual review' });
  const namesOfEvents = new Set(value.events.map((e) => e.name));
  for (const name of ['version', 'login', 'create', 'upload-server', 'start', 'expose', 'routes', 'kill']) {
    if (!namesOfEvents.has(name)) ctx.addIssue({ code: 'custom', message: `Missing required CLI event: ${name}` });
  }
  if (!value.terminal.stdout.includes('/workspace')) ctx.addIssue({ code: 'custom', message: 'PTY workspace evidence missing' });
  for (const output of ['server.mjs', 'index.html']) if (!value.terminal.stdout.includes(output)) ctx.addIssue({ code: 'custom', message: 'PTY file evidence missing' });
});

export type Capture = z.infer<typeof captureSchema>;
export type Checkpoint = Capture['checkpoints'][number];
export function requirePublishable(value: unknown): Capture {
  const capture = captureSchema.parse(value);
  if (!capture.publishable || capture.status !== 'verified') throw new Error('Capture has not been reviewed for publication');
  return capture;
}
