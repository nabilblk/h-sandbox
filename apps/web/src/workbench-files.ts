import type { SandboxFileDownloadResponse } from "@harakiri/shared";

export const previewLimit = 256 * 1024;
export const browserArtifactLimit = 16 * 1024 * 1024;

export const artifactChecksum = async (bytes: Uint8Array<ArrayBuffer>) => {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export function encodeArtifact(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(parts.join(""));
}

export async function decodeArtifact(result: SandboxFileDownloadResponse, maxBytes: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(result.sizeBytes) || result.sizeBytes < 0 || result.sizeBytes > maxBytes) throw new Error(`File exceeds the ${maxBytes}-byte display or transfer limit.`);
  if (typeof result.contentBase64 !== "string" || result.contentBase64.length !== 4 * Math.ceil(result.sizeBytes / 3)) throw new Error("Invalid artifact length.");
  const content = atob(result.contentBase64);
  if (content.length !== result.sizeBytes) throw new Error("Artifact size verification failed.");
  const bytes = new Uint8Array(content.length);
  for (let index = 0; index < content.length; index++) bytes[index] = content.charCodeAt(index);
  if (await artifactChecksum(bytes) !== result.sha256) throw new Error("Artifact checksum verification failed.");
  signal?.throwIfAborted();
  return bytes;
}

export function previewText(bytes: Uint8Array) {
  if (bytes.includes(0)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return null; }
}

export function uploadPath(directory: string, name: string) {
  if (!name || name === "." || name === ".." || /[/\\\x00-\x1f\x7f]/.test(name)) throw new Error("Invalid upload filename.");
  return `${directory.replace(/\/+$/, "")}/${name}`;
}

export const downloadName = (path: string) => path.split(/[/\\]/).at(-1)?.replace(/[\x00-\x1f\x7f]/g, "_") || "artifact";

export function saveArtifact(bytes: Uint8Array<ArrayBuffer>, path: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url; link.download = downloadName(path); link.rel = "noopener";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
