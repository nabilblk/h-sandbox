import { z } from 'zod';

export const workflowSchema = z.object({
  id: z.enum(['cli-agent-repair', 'ui-agent-app', 'sdk-agent-report', 'browser-agent-qa']),
  title: z.string(), surface: z.enum(['CLI', 'UI', 'SDK']),
  capturedAt: z.string().datetime(), model: z.string().regex(/^opencode\/[a-z0-9.-]+-free$/),
  version: z.string(), sandboxId: z.string().startsWith('sbx_'), templateVersion: z.string(),
  cleanup: z.literal(true), costs: z.array(z.literal(0)).min(1),
  sourceEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  assets: z.record(z.string().regex(/^[a-z-]+\.(png|mp4)$/), z.string().regex(/^[a-f0-9]{64}$/)),
  scenes: z.array(z.object({
    title: z.string(), caption: z.string(), seconds: z.number().int().min(4).max(24),
    kind: z.enum(['terminal', 'code', 'tools', 'footage', 'result', 'overview', 'image']), label: z.string(),
    content: z.string().default(''), command: z.string().optional(),
    steps: z.array(z.object({ title: z.string(), detail: z.string() })).length(3).optional(),
    fontSize: z.number().int().min(28).max(43).optional(),
    video: z.string().regex(/^[a-z-]+\.mp4$/).optional(), image: z.string().regex(/^[a-z-]+\.png$/).optional(),
    footageSeconds: z.number().positive().optional(),
  }).refine((scene) => scene.kind !== 'footage' || (scene.video && scene.image && scene.footageSeconds), 'Footage requires recorded video, final frame and duration')
    .refine((scene) => scene.kind !== 'overview' || !!scene.steps, 'Overview requires three structured steps')
    .refine((scene) => scene.kind !== 'image' || !!scene.image, 'Image scene requires a captured asset')).min(5),
});
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowScene = Workflow['scenes'][number];
export const workflowIds = ['cli-agent-repair', 'ui-agent-app', 'sdk-agent-report', 'browser-agent-qa'] as const;
