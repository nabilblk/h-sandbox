import type { HarakiriClient } from "./index.js";
import type { RequestOptions } from "./request.js";
import type {
  SandboxFileEntry, SandboxFileWriteBody, SandboxFileWriteResponse,
  SandboxFileMkdirBody, SandboxFileRenameBody, SandboxFileUploadBody
} from "./protocol.js";

export type WriteFileOptions = RequestOptions & { createParents?: boolean; mode?: string };

const encode = (bytes: Uint8Array) => {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(""));
};

const checksum = async (bytes: Uint8Array<ArrayBuffer>) => {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export const runtimePath = (path: string, workdir: string) => {
  if (!path || path.includes("\0")) throw new TypeError("A nonempty file path without NUL characters is required.");
  return path.startsWith("/") ? path : `${workdir.replace(/\/+$/, "")}/${path}`;
};

export function createSandboxFiles(client: HarakiriClient, id: () => string, workdir: () => string, maxBytes: () => number) {
  const checkSize = (size: number) => {
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes()) {
      throw new RangeError(`File exceeds the sandbox's buffered artifact limit (${maxBytes()} bytes).`);
    }
  };

  function write(input: SandboxFileWriteBody, options?: RequestOptions): Promise<SandboxFileWriteResponse>;
  function write(path: string, content: string | Uint8Array, options?: WriteFileOptions): Promise<SandboxFileEntry>;
  async function write(input: string | SandboxFileWriteBody, content?: string | Uint8Array | RequestOptions, options: WriteFileOptions = {}) {
    if (typeof input !== "string") return client.files.write(id(), input, content as RequestOptions | undefined);
    const { signal, requestTimeoutMs, ...bodyOptions } = options;
    const request = { signal, requestTimeoutMs };
    signal?.throwIfAborted();
    const path = runtimePath(input, workdir());
    if (typeof content === "string") {
      checkSize(new TextEncoder().encode(content).byteLength);
      return (await client.files.write(id(), { path, content, encoding: "utf8", ...bodyOptions }, request)).file;
    }
    if (!(content instanceof Uint8Array)) throw new TypeError("File content must be text or Uint8Array.");
    checkSize(content.byteLength);
    const bytes = new Uint8Array(content);
    const sha256 = await checksum(bytes);
    signal?.throwIfAborted();
    const result = await client.files.upload(id(), { path, contentBase64: encode(bytes), sizeBytes: bytes.length, sha256, ...bodyOptions }, request);
    if (result.sizeBytes !== bytes.length || result.sha256 !== sha256) throw new Error("Uploaded artifact checksum or size does not match.");
    return result.file;
  }

  return {
    list: (path?: string, options: RequestOptions = {}) => client.files.list(id(), path, options),
    stat: (path: string, options: RequestOptions = {}) => client.files.stat(id(), path, options),
    /** Compatibility method returning the wire response. Prefer readText/readBytes for ordinary files. */
    read: (path: string, options: RequestOptions & { encoding?: "utf8" | "base64" } = {}) => client.files.read(id(), path, options),
    readText: async (path: string, options: RequestOptions = {}): Promise<string> =>
      (await client.files.read(id(), runtimePath(path, workdir()), { ...options, encoding: "utf8" })).content,
    /** Buffered transfer with size and SHA-256 verification, not a streaming API. */
    readBytes: async (path: string, options: RequestOptions = {}): Promise<Uint8Array> => {
      const result = await client.files.download(id(), runtimePath(path, workdir()), options);
      checkSize(result.sizeBytes);
      if (result.contentBase64.length > 4 * Math.ceil(result.sizeBytes / 3)) throw new Error("Downloaded artifact encoding exceeds its declared size.");
      const decoded = atob(result.contentBase64);
      if (decoded.length !== result.sizeBytes) throw new Error("Downloaded artifact checksum or size does not match.");
      // Avoid the per-byte JavaScript array created by Uint8Array.from(string).
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
      if (await checksum(bytes) !== result.sha256) {
        throw new Error("Downloaded artifact checksum or size does not match.");
      }
      options.signal?.throwIfAborted();
      return bytes;
    },
    write,
    mkdir: (input: SandboxFileMkdirBody, options: RequestOptions = {}) => client.files.mkdir(id(), input, options),
    remove: (path: string, options: RequestOptions & { recursive?: boolean } = {}) => client.files.remove(id(), path, options),
    rename: (input: SandboxFileRenameBody, options: RequestOptions = {}) => client.files.rename(id(), input, options),
    upload: (input: SandboxFileUploadBody, options: RequestOptions = {}) => client.files.upload(id(), input, options),
    download: (path: string, options: RequestOptions = {}) => client.files.download(id(), path, options)
  };
}
