import type {
  DynamicCredentialIssuerType,
  GitHubAppInstallationScope
} from "@harakiri/shared";

export type DynamicCredentialValidation =
  | { kind: "ok" }
  | { kind: "not_found"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "unavailable"; message: string };

export type DynamicCredentialIssuance =
  | {
    kind: "ok";
    value: string;
    expiresAt: string;
    metadata: Record<string, unknown>;
  }
  | Exclude<DynamicCredentialValidation, { kind: "ok" }>;

export type DynamicCredentialIssuerAdapter = {
  type: DynamicCredentialIssuerType;
  validate(scope: GitHubAppInstallationScope): Promise<DynamicCredentialValidation>;
  issue(scope: GitHubAppInstallationScope): Promise<DynamicCredentialIssuance>;
};

export type DynamicCredentialIssuerRegistry = Partial<
  Record<DynamicCredentialIssuerType, DynamicCredentialIssuerAdapter>
>;
