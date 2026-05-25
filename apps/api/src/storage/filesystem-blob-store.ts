import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import type { BlobRef, BlobStore, PutBlobInput, StoredBlob } from "./blob-store.js";

const digest = (body: Uint8Array) => `sha256:${createHash("sha256").update(body).digest("hex")}`;

const safeKey = (key: string) => {
  const normalized = key
    .split(/[\\/]+/g)
    .filter((part) => part && part !== ".")
    .join("/");
  if (!normalized || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../") || key.startsWith("/")) {
    throw new Error(`unsafe blob key: ${key}`);
  }
  return normalized;
};

export class FileSystemBlobStore implements BlobStore {
  readonly kind = "filesystem";

  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string) {
    const target = resolve(this.root, safeKey(key));
    if (!target.startsWith(`${this.root}${sep}`) && target !== this.root) throw new Error(`unsafe blob key: ${key}`);
    return target;
  }

  private metadataPathFor(key: string) {
    return `${this.pathFor(key)}.metadata.json`;
  }

  async put(input: PutBlobInput): Promise<BlobRef> {
    const path = this.pathFor(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);
    const ref: BlobRef = {
      store: this.kind,
      key: safeKey(input.key),
      sha256: input.sha256 ?? digest(input.body),
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      metadata: input.metadata ?? {}
    };
    await writeFile(this.metadataPathFor(input.key), JSON.stringify(ref, null, 2));
    return ref;
  }

  async get(ref: BlobRef): Promise<StoredBlob | null> {
    try {
      const body = await readFile(this.pathFor(ref.key));
      const metadata = await readFile(this.metadataPathFor(ref.key), "utf8")
        .then((raw) => JSON.parse(raw) as BlobRef)
        .catch(() => ref);
      return {
        ...metadata,
        store: this.kind,
        key: safeKey(ref.key),
        body
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(ref: BlobRef): Promise<number> {
    const existed = await this.exists(ref);
    await rm(this.pathFor(ref.key), { force: true });
    await rm(this.metadataPathFor(ref.key), { force: true });
    return existed ? 1 : 0;
  }

  async exists(ref: BlobRef): Promise<boolean> {
    return (await this.get(ref)) !== null;
  }
}
