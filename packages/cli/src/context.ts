import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

const ignoredDirectories = new Set([".git", "node_modules", ".next", "dist", "coverage", ".turbo"]);
const ignoredFiles = new Set([".DS_Store"]);
const blockSize = 512;

export type BuildContextArchive = {
  archive: Buffer;
  archiveBase64: string;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  format: "tar+gzip";
};

const toPosixPath = (path: string) => path.split(sep).join("/");

const writeString = (buffer: Buffer, value: string, offset: number, length: number) => {
  buffer.write(value.slice(0, length), offset, length, "utf8");
};

const writeOctal = (buffer: Buffer, value: number, offset: number, length: number) => {
  const encoded = value.toString(8).padStart(length - 1, "0");
  writeString(buffer, `${encoded}\0`, offset, length);
};

const splitTarPath = (name: string) => {
  const encoded = Buffer.byteLength(name);
  if (encoded <= 100) return { name, prefix: "" };
  const parts = name.split("/");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const prefix = parts.slice(0, index).join("/");
    const suffix = parts.slice(index).join("/");
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(suffix) <= 100) return { name: suffix, prefix };
  }
  throw new Error(`path is too long for build context tar: ${name}`);
};

const tarHeader = (name: string, size: number, mode: number) => {
  const header = Buffer.alloc(blockSize);
  const path = splitTarPath(name);
  writeString(header, path.name, 0, 100);
  writeOctal(header, mode & 0o777, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, 0, 136, 12);
  header.fill(" ", 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, "ustar", 257, 6);
  writeString(header, "00", 263, 2);
  writeString(header, "harakiri", 265, 32);
  writeString(header, "harakiri", 297, 32);
  if (path.prefix) writeString(header, path.prefix, 345, 155);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeString(header, `${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
};

const pad = (length: number) => {
  const remainder = length % blockSize;
  return remainder ? Buffer.alloc(blockSize - remainder) : Buffer.alloc(0);
};

const walk = async (root: string, current: string, files: string[] = []) => {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.isFile() && ignoredFiles.has(entry.name)) continue;
    const absolute = resolve(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, files);
    } else if (entry.isFile()) {
      files.push(toPosixPath(relative(root, absolute)));
    }
  }
  return files;
};

export const createBuildContextArchive = async (contextPath: string): Promise<BuildContextArchive> => {
  const root = resolve(contextPath);
  const stat = await lstat(root);
  if (!stat.isDirectory()) throw new Error(`template build context must be a directory: ${contextPath}`);
  const files = (await walk(root, root)).sort();
  if (!files.length) throw new Error(`template build context is empty: ${contextPath}`);

  const chunks: Buffer[] = [];
  for (const file of files) {
    const absolute = resolve(root, file);
    const content = await readFile(absolute);
    const fileStat = await lstat(absolute);
    chunks.push(tarHeader(file, content.byteLength, fileStat.mode));
    chunks.push(content);
    chunks.push(pad(content.byteLength));
  }
  chunks.push(Buffer.alloc(blockSize * 2));

  const archive = gzipSync(Buffer.concat(chunks), { level: 9 });
  const sha256 = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
  return {
    archive,
    archiveBase64: archive.toString("base64"),
    sha256,
    sizeBytes: archive.byteLength,
    fileCount: files.length,
    format: "tar+gzip"
  };
};
