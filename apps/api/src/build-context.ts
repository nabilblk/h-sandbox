import { createHash } from "node:crypto";

export type BuildContextUploadBody = {
  archiveBase64: string;
  sha256: string;
  sizeBytes: number;
  format?: string;
  fileCount?: number;
  metadata?: Record<string, unknown>;
};

export type DecodedBuildContextUpload = {
  archive: Buffer;
  sha256: string;
  sizeBytes: number;
  format: "tar+gzip";
  fileCount: number | null;
  metadata: Record<string, unknown>;
};

export const sha256Digest = (input: Buffer) => `sha256:${createHash("sha256").update(input).digest("hex")}`;

export const decodeBuildContextUpload = (body: BuildContextUploadBody, maxBytes: number): DecodedBuildContextUpload => {
  if ((body.format ?? "tar+gzip") !== "tar+gzip") throw new Error("unsupported build context format");
  if (!Number.isInteger(body.sizeBytes) || body.sizeBytes <= 0) throw new Error("build context sizeBytes must be a positive integer");
  if (body.sizeBytes > maxBytes) throw new Error(`build context exceeds ${maxBytes} bytes`);
  if (!/^sha256:[a-f0-9]{64}$/.test(body.sha256)) throw new Error("build context sha256 must be sha256:<64 lowercase hex chars>");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.archiveBase64)) throw new Error("build context archiveBase64 is not valid base64");
  const archive = Buffer.from(body.archiveBase64, "base64");
  if (archive.byteLength !== body.sizeBytes) throw new Error(`build context size mismatch: expected ${body.sizeBytes}, got ${archive.byteLength}`);
  const actual = sha256Digest(archive);
  if (actual !== body.sha256) throw new Error(`build context sha256 mismatch: expected ${body.sha256}, got ${actual}`);
  return {
    archive,
    sha256: actual,
    sizeBytes: archive.byteLength,
    format: "tar+gzip",
    fileCount: body.fileCount ?? null,
    metadata: body.metadata ?? {}
  };
};
