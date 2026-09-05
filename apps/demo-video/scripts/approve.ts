import { copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { workspace, writeJson } from './io.js';
import { reviewDigest, verifyCapture } from './verify-capture.js';
import { prepareAssets } from './prepare-assets.js';

const source = process.argv[2];
const reviewer = process.argv[3];
if (!source || !reviewer) throw new Error('Usage: pnpm demo:approve <candidate-directory> <reviewer>; inspect every screenshot and clip first');
const capture = await verifyCapture(resolve(source));
capture.review = { reviewedAt: new Date().toISOString(), reviewer, manifestSha256: reviewDigest(capture) };
capture.status = 'verified';
capture.publishable = true;
const destination = join(workspace, 'public/capture');
await mkdir(destination, { recursive: true });
// Only the explicit, hashed media allowlist crosses from private artifacts to public input.
for (const point of capture.checkpoints) for (const asset of [point.image, point.video]) await copyFile(join(source, asset), join(destination, asset));
await writeJson(join(destination, 'capture.json'), capture);
await writeJson(join(destination, 'verification.json'), { schemaVersion: 1, verifiedAt: capture.review.reviewedAt, manifestSha256: capture.review.manifestSha256, imagesChecked: capture.checkpoints.length, clipsChecked: capture.checkpoints.length, ocrFramesPerSecond: 2, textSanitized: true, mediaHashesVerified: true, metadataChecked: true, visualReviewer: reviewer });
await prepareAssets();
console.log('Reviewed capture approved. Only sanitized, hashed source assets were copied.');
