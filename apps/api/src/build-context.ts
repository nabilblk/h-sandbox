import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

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

const blockSize = 512;

const headerString = (buffer: Buffer, offset: number, length: number) => buffer.toString("utf8", offset, offset + length).replace(/\0.*$/, "");

const headerOctal = (buffer: Buffer, offset: number, length: number) => {
  const raw = headerString(buffer, offset, length).trim();
  return raw ? Number.parseInt(raw, 8) : 0;
};

export const extractTarGzipBuildContext = async (archive: Buffer, outputDir: string) => {
  const root = resolve(outputDir);
  const tar = gunzipSync(archive);
  let offset = 0;
  let files = 0;
  await mkdir(root, { recursive: true });
  while (offset + blockSize <= tar.byteLength) {
    const header = tar.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) break;
    const name = headerString(header, 0, 100);
    const prefix = headerString(header, 345, 155);
    const typeFlag = headerString(header, 156, 1) || "0";
    const size = headerOctal(header, 124, 12);
    const relative = [prefix, name].filter(Boolean).join("/");
    const normalized = relative.split("/").filter((part) => part && part !== ".").join(sep);
    if (!normalized || normalized.includes(`..${sep}`) || normalized === ".." || relative.startsWith("/")) throw new Error(`unsafe build context path: ${relative}`);
    const target = resolve(root, normalized);
    if (!target.startsWith(`${root}${sep}`) && target !== root) throw new Error(`unsafe build context path: ${relative}`);
    const contentStart = offset + blockSize;
    const contentEnd = contentStart + size;
    if (contentEnd > tar.byteLength) throw new Error(`truncated build context file: ${relative}`);
    if (typeFlag === "0" || typeFlag === "") {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, tar.subarray(contentStart, contentEnd));
      files += 1;
    }
    offset = contentStart + Math.ceil(size / blockSize) * blockSize;
  }
  return { files };
};
