import type {
  CredentialProviderPreset,
  CredentialProviderProfileId,
  CustomCredentialAuthType,
  CustomCredentialProfile,
  CustomCredentialProfileInput
} from "@harakiri/shared";
import { Field } from "../components/ui";

export type CustomCredentialProfileDraft = {
  host: string;
  authType: CustomCredentialAuthType;
  headerName: string;
  methods: string;
  paths: string;
  envName: string;
  testPath: string;
};

export const emptyCustomCredentialProfile = (): CustomCredentialProfileDraft => ({
  host: "",
  authType: "bearer",
  headerName: "",
  methods: "GET, POST",
  paths: "/*",
  envName: "PRIVATE_API_KEY",
  testPath: "/"
});

export const customCredentialProfileDraft = (
  profile: CustomCredentialProfile | CustomCredentialProfileInput | null | undefined
): CustomCredentialProfileDraft => profile ? {
  host: profile.host,
  authType: profile.authType,
  headerName: profile.headerName ?? "",
  methods: (profile.methods ?? ["GET", "POST"]).join(", "),
  paths: (profile.paths ?? ["/*"]).join(", "),
  envName: profile.envName ?? "PRIVATE_API_KEY",
  testPath: profile.testPath ?? "/"
} : emptyCustomCredentialProfile();

const commaSeparatedValues = (value: string) => value
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const customCredentialProfileInput = (
  draft: CustomCredentialProfileDraft
): CustomCredentialProfileInput => ({
  host: draft.host.trim(),
  authType: draft.authType,
  headerName: draft.authType === "apiKey" ? draft.headerName.trim() : undefined,
  methods: commaSeparatedValues(draft.methods),
  paths: commaSeparatedValues(draft.paths),
  envName: draft.envName.trim() || undefined,
  testPath: draft.testPath.trim() || undefined
});

export const credentialProfileComplete = (
  profileId: CredentialProviderProfileId | "",
  custom: CustomCredentialProfileDraft
) => Boolean(
  profileId
  && (
    profileId !== "custom"
    || (custom.host.trim() && (custom.authType !== "apiKey" || custom.headerName.trim()))
  )
);

type CredentialProfileFieldsProps = {
  profileId: CredentialProviderProfileId | "";
  custom: CustomCredentialProfileDraft;
  presets: CredentialProviderPreset[];
  onProfileChange?: (profileId: CredentialProviderProfileId) => void;
  onCustomChange: (custom: CustomCredentialProfileDraft) => void;
  showSelector?: boolean;
};

export const CredentialProfileFields = ({
  profileId,
  custom,
  presets,
  onProfileChange,
  onCustomChange,
  showSelector = true
}: CredentialProfileFieldsProps) => (
  <>
    {showSelector ? <Field label="Credential profile">
      <select
        className="input"
        value={profileId}
        onChange={(event) => onProfileChange?.(event.target.value as CredentialProviderProfileId)}
      >
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        <option value="custom">Private API</option>
      </select>
    </Field> : null}
    {profileId === "custom" ? (
      <div className="vault-custom-profile">
        <div className="vault-form-grid">
          <Field label="API host" hint="Exact DNS name; HTTPS only.">
            <input
              className="input mono"
              placeholder="api.internal.example.com"
              value={custom.host}
              onChange={(event) => onCustomChange({ ...custom, host: event.target.value })}
            />
          </Field>
          <Field label="Authentication">
            <select
              className="input"
              value={custom.authType}
              onChange={(event) => onCustomChange({
                ...custom,
                authType: event.target.value as CustomCredentialAuthType,
                headerName: event.target.value === "bearer" ? "" : custom.headerName
              })}
            >
              <option value="bearer">Bearer token</option>
              <option value="apiKey">API key header</option>
            </select>
          </Field>
        </div>
        {custom.authType === "apiKey" ? (
          <Field label="Header name">
            <input
              className="input mono"
              placeholder="X-API-Key"
              value={custom.headerName}
              onChange={(event) => onCustomChange({ ...custom, headerName: event.target.value })}
            />
          </Field>
        ) : null}
        <div className="vault-form-grid">
          <Field label="HTTP methods" hint="Comma-separated.">
            <input className="input mono" value={custom.methods} onChange={(event) => onCustomChange({ ...custom, methods: event.target.value })} />
          </Field>
          <Field label="Allowed paths" hint="Comma-separated; wildcards are supported.">
            <input className="input mono" value={custom.paths} onChange={(event) => onCustomChange({ ...custom, paths: event.target.value })} />
          </Field>
        </div>
        <div className="vault-form-grid">
          <Field label="Fake environment variable">
            <input className="input mono" value={custom.envName} onChange={(event) => onCustomChange({ ...custom, envName: event.target.value })} />
          </Field>
          <Field label="Test path">
            <input className="input mono" value={custom.testPath} onChange={(event) => onCustomChange({ ...custom, testPath: event.target.value })} />
          </Field>
        </div>
      </div>
    ) : null}
  </>
);
