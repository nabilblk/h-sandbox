export type BuildLogStoreKind = "postgres" | "filesystem" | string;

export type BuildLogStream = "stdout" | "stderr";

export type BuildLogRecord = {
  lineNo: number;
  stream: BuildLogStream;
  message: string;
  createdAt: string;
};

export type AppendBuildLogInput = {
  buildId: string;
  stream: BuildLogStream;
  message: string;
  createdAt?: string;
};

export interface BuildLogStore {
  readonly kind: BuildLogStoreKind;

  append(input: AppendBuildLogInput): Promise<BuildLogRecord>;
  list(buildId: string, options?: { afterLineNo?: number; limit?: number }): Promise<BuildLogRecord[]>;
  delete(buildId: string): Promise<number>;
}
