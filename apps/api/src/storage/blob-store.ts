export type BlobStoreKind = "filesystem" | "postgres" | "s3" | string;

export type BlobRef = {
  store: BlobStoreKind;
  key: string;
  sha256?: string;
  sizeBytes?: number;
  contentType?: string;
  metadata?: Record<string, unknown>;
};

export type PutBlobInput = {
  key: string;
  body: Uint8Array;
  sha256?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
};

export type StoredBlob = BlobRef & {
  body: Uint8Array;
};

export interface BlobStore {
  readonly kind: BlobStoreKind;

  put(input: PutBlobInput): Promise<BlobRef>;
  get(ref: BlobRef): Promise<StoredBlob | null>;
  delete(ref: BlobRef): Promise<number>;
  exists(ref: BlobRef): Promise<boolean>;
}
