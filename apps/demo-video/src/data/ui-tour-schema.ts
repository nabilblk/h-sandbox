import { z } from 'zod';
import { uiProductTourSteps } from '../../../web/src/ui-product-tour';

export const tourViewport = { width: 1920, height: 1080 } as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const uiTourSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.literal('ui-product-tour'),
  capturedAt: z.iso.datetime(),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  sourceFiles: z.record(z.string(), hash),
  appOrigin: z.string().url(),
  frontend: z.literal('local-source-preview-against-live-api'),
  apiOrigin: z.string().url(),
  previewOrigin: z.string().url(),
  viewport: z.object({ width: z.literal(1920), height: z.literal(1080), deviceScaleFactor: z.literal(1), browserZoom: z.literal(1) }),
  fixtureHashes: z.record(z.string(), hash),
  reportSha256: hash,
  replacementVerified: z.literal(true),
  networkProof: z.object({ baselineReachable: z.literal(true), allowedReachable: z.literal(true), unlistedDenied: z.literal(true) }),
  cleanup: z.object({ runtimesTerminated: z.literal(2), routesInactive: z.literal(true), workspace: z.literal('archived-files-retained'), captureKeyRevoked: z.literal(true) }),
  clips: z.array(z.object({
    id: z.string(), file: z.string().regex(/^[a-z-]+\.mp4$/), sha256: hash,
    seconds: z.number().positive().max(30), width: z.literal(1920), height: z.literal(1080),
    crop: z.literal('none'), speed: z.literal(1),
    recording: z.object({ source: z.literal('cdp-screencast'), frameCount: z.number().int().positive(), startedAt: z.iso.datetime(), endedAt: z.iso.datetime() }),
    pointer: z.array(z.object({ at: z.number().nonnegative(), x: z.number().min(0).max(1920), y: z.number().min(0).max(1080), click: z.boolean() })),
  })).length(uiProductTourSteps.length),
}).superRefine((tour, context) => {
  tour.clips.forEach((clip, index) => {
    const expected = uiProductTourSteps[index]!;
    if (clip.id !== expected.id || clip.seconds !== expected.seconds || clip.file !== `${clip.id}.mp4`) context.addIssue({ code: 'custom', message: 'Clips must match the timed tour story in order' });
    if (clip.pointer.some((point, i) => point.at > clip.seconds || (i > 0 && point.at < clip.pointer[i - 1]!.at))) context.addIssue({ code: 'custom', message: 'Pointer input must be ordered within the real recording' });
    if (Math.abs(Date.parse(clip.recording.endedAt) - Date.parse(clip.recording.startedAt) - clip.seconds * 1000) > 2) context.addIssue({ code: 'custom', message: 'A clip must retain its original elapsed duration' });
  });
});
export type UiTour = z.infer<typeof uiTourSchema>;
