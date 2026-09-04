import {
  credentialProviderPresetCatalog,
  credentialProviderPresetIds,
  type CredentialProviderPresetId,
  type CredentialProviderProfileId,
  type CustomCredentialProfileInput,
  type AttachSandboxCredentialBody,
  type CredentialVaultAuth,
  type CredentialVaultBinding,
  type CredentialVaultMatch,
  type DynamicSandboxCredentialBody,
  type ExternalReferenceSandboxCredentialBody,
  type HarakiriEncryptedSandboxCredentialBody,
  type InlineEphemeralSandboxCredentialBody,
  type InlineEphemeralTemplateCredentialSourceBody,
  type TemplateCredentialSlotMappingBody,
  type TemplateCredentialSlotSourceBody
} from "@h-sandbox/sdk";
import type { Command } from "commander";

const credentialAuthTypes = ["api-key", "bearer", "basic"] as const;
export type CredentialAuthType = typeof credentialAuthTypes[number];

export type SecretValueOptions = {
  fromEnv?: string;
  fromStdin?: boolean;
  prompt?: boolean;
};

type SecretValueDependencies = {
  prompt?: () => Promise<string>;
};

type ParsedCredentialSpec = SecretValueOptions & {
  presetId?: CredentialProviderPresetId;
  secretId?: string;
  referenceId?: string;
  issuerId?: string;
  slotId?: string;
  slotProviderPresetId?: CredentialProviderPresetId;
  displayName?: string;
  credentialName?: string;
  bindingName?: string;
  hosts: string[];
  schemes: string[];
  methods: string[];
  paths: string[];
  fakeEnv: Record<string, string>;
  auth: CredentialAuthType;
  authFromUser: boolean;
  header?: string;
  headerFromUser: boolean;
};

export type CredentialDirectOptions = SecretValueOptions & {
  preset?: string;
  host?: string[];
  name?: string;
  credentialName?: string;
  bindingName?: string;
  auth?: CredentialAuthType;
  header?: string;
  scheme?: string[];
  method?: string[];
  path?: string[];
  fakeEnv?: Record<string, string>;
};

export const parseAuthType = (value: string) => {
  if (!credentialAuthTypes.includes(value as CredentialAuthType)) {
    throw new Error("--auth must be api-key, bearer, or basic");
  }
  return value as CredentialAuthType;
};

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
};

type HiddenPromptAction = "continue" | "submit" | "cancel";

const applyHiddenPromptChar = (char: string, chars: string[]): HiddenPromptAction => {
  if (char === "\u0003") return "cancel";
  if (char === "\r" || char === "\n") return "submit";
  if (char === "\u007f" || char === "\b") {
    chars.pop();
    return "continue";
  }
  if (char.charCodeAt(0) >= 32) chars.push(char);
  return "continue";
};

const restoreHiddenPrompt = (input: typeof process.stdin, wasRaw: boolean) => {
  input.setRawMode(wasRaw);
  if (!wasRaw) input.pause();
  process.stderr.write("\n");
};

const collectHiddenPrompt = async (input: typeof process.stdin, wasRaw: boolean) => await new Promise<string>((resolve, reject) => {
  const chars: string[] = [];
  const onData = (chunk: Buffer) => {
    for (const char of chunk.toString("utf8")) {
      const action = applyHiddenPromptChar(char, chars);
      if (action === "continue") continue;
      input.off("data", onData);
      restoreHiddenPrompt(input, wasRaw);
      if (action === "cancel") reject(new Error("credential prompt canceled"));
      else {
        const value = chars.join("");
        if (!value) reject(new Error("prompt did not contain a credential value"));
        else resolve(value);
      }
      return;
    }
  };
  input.on("data", onData);
});

const readHiddenPrompt = async () => {
  const input = process.stdin;
  const output = process.stderr;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("--prompt requires an interactive TTY. Use --from-env or --from-stdin in scripts.");
  }

  const wasRaw = Boolean(input.isRaw);
  output.write("Credential value: ");
  input.setRawMode(true);
  input.resume();
  return collectHiddenPrompt(input, wasRaw);
};

export const secretFromOptions = async (options: SecretValueOptions, dependencies: SecretValueDependencies = {}) => {
  const sourceCount = [options.fromEnv, options.fromStdin, options.prompt].filter(Boolean).length;
  if (sourceCount > 1) throw new Error("choose only one of --from-env, --from-stdin, or --prompt");
  if (options.fromEnv) {
    const value = process.env[options.fromEnv];
    if (!value) throw new Error(`environment variable ${options.fromEnv} is not set or empty`);
    return value;
  }
  if (options.fromStdin) {
    const value = await readStdin();
    if (!value) throw new Error("stdin did not contain a credential value");
    return value;
  }
  if (options.prompt) {
    const value = await (dependencies.prompt ? dependencies.prompt() : readHiddenPrompt());
    if (!value) throw new Error("prompt did not contain a credential value");
    return value;
  }
  throw new Error("credential value is required. Use --from-env NAME, --from-stdin, or --prompt.");
};

export const credentialAuthFromOptions = (options: { auth: CredentialAuthType; header?: string }) => {
  if (options.auth === "api-key") {
    return { type: "apiKey", name: options.header ?? "x-api-key" } satisfies CredentialVaultAuth;
  }
  if (options.auth === "bearer") return { type: "bearer" } satisfies CredentialVaultAuth;
  return { type: "basic" } satisfies CredentialVaultAuth;
};

export const parseCredentialProviderPresetId = (value: string) => {
  if (!credentialProviderPresetIds.includes(value as CredentialProviderPresetId)) {
    throw new Error(`unknown credential provider preset: ${value}`);
  }
  return value as CredentialProviderPresetId;
};

export type CredentialProfileOptions = {
  preset?: string;
  host?: string;
  auth?: CredentialAuthType;
  header?: string;
  method?: string[];
  path?: string[];
  envName?: string;
  testPath?: string;
};

export type ParsedCredentialProfile = {
  providerPresetId: CredentialProviderProfileId;
  customProfile?: CustomCredentialProfileInput;
};

const collectProfileValue = (value: string, previous: string[] = []) => [...previous, value];

export const addCredentialProfileOptions = (command: Command) => command
  .option("--preset <id>", "built-in provider preset id")
  .option("--host <hostname>", "exact HTTPS hostname for a private API profile")
  .option("--auth <type>", "private API auth: bearer or api-key", parseAuthType)
  .option("--header <name>", "header name for private API api-key auth")
  .option("--method <method>", "allowed private API HTTP method; repeatable", collectProfileValue, [])
  .option("--path <path>", "allowed private API path; repeatable", collectProfileValue, [])
  .option("--env-name <name>", "fake environment variable for the private API credential")
  .option("--test-path <path>", "private API path used by vault test");

export const credentialProfileFromOptions = (
  options: CredentialProfileOptions,
  required = true
): ParsedCredentialProfile | undefined => {
  const hasCustomFields = Boolean(
    options.host
    || options.auth
    || options.header
    || options.method?.length
    || options.path?.length
    || options.envName
    || options.testPath
  );
  if (options.preset && hasCustomFields) {
    throw new Error("choose either --preset or private API profile options, not both");
  }
  if (options.preset) return { providerPresetId: parseCredentialProviderPresetId(options.preset) };
  if (!hasCustomFields) {
    if (required) throw new Error("credential profile is required. Use --preset or --host.");
    return undefined;
  }
  if (!options.host?.trim()) throw new Error("private API credentials require --host");
  const auth = options.auth ?? "bearer";
  if (auth === "basic") throw new Error("private API profiles support bearer or api-key auth");
  if (auth === "api-key" && !options.header?.trim()) {
    throw new Error("private API api-key auth requires --header");
  }
  if (auth === "bearer" && options.header) {
    throw new Error("private API bearer auth does not accept --header");
  }
  return {
    providerPresetId: "custom",
    customProfile: {
      host: options.host.trim(),
      authType: auth === "api-key" ? "apiKey" : "bearer",
      headerName: options.header?.trim(),
      methods: options.method?.length ? options.method : undefined,
      paths: options.path?.length ? options.path : undefined,
      envName: options.envName?.trim() || undefined,
      testPath: options.testPath?.trim() || undefined
    }
  };
};

const cleanList = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);

const emptyCredentialSpec = (): ParsedCredentialSpec => ({
  hosts: [],
  schemes: [],
  methods: [],
  paths: [],
  fakeEnv: {},
  auth: "api-key",
  authFromUser: false,
  headerFromUser: false
});

const splitSpecPart = (part: string) => {
  const index = part.indexOf("=");
  if (index <= 0) throw new Error("credential spec entries must be key=value");
  return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
};

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const addFakeEnv = (value: string, previous: Record<string, string>) => {
  const index = value.indexOf("=");
  if (index <= 0) throw new Error("fake-env must be formatted as KEY=value");
  const key = value.slice(0, index);
  if (!envNamePattern.test(key)) throw new Error("fake-env key must match [A-Za-z_][A-Za-z0-9_]*");
  return { ...previous, [key]: value.slice(index + 1) };
};

const addCredentialSpecPart = (spec: ParsedCredentialSpec, key: string, value: string) => {
  if (!value && key !== "fake-env") throw new Error(`credential spec ${key} cannot be empty`);
  if (key === "preset") spec.presetId = parseCredentialProviderPresetId(value);
  else if (key === "secret-id") spec.secretId = value;
  else if (key === "reference-id" || key === "external-ref-id") spec.referenceId = value;
  else if (key === "issuer-id" || key === "dynamic-issuer-id") spec.issuerId = value;
  else if (key === "slot" || key === "slot-id") spec.slotId = value;
  else if (key === "slot-preset" || key === "provider-preset") spec.slotProviderPresetId = parseCredentialProviderPresetId(value);
  else if (key === "name" || key === "display-name") spec.displayName = value;
  else if (key === "credential-name") spec.credentialName = value;
  else if (key === "binding-name") spec.bindingName = value;
  else if (key === "host") spec.hosts.push(value);
  else if (key === "scheme") spec.schemes.push(value);
  else if (key === "method") spec.methods.push(value);
  else if (key === "path") spec.paths.push(value);
  else if (key === "auth") {
    spec.auth = parseAuthType(value);
    spec.authFromUser = true;
  }
  else if (key === "header") {
    spec.header = value;
    spec.headerFromUser = true;
  }
  else if (key === "from-env") spec.fromEnv = value;
  else if (key === "from-stdin") {
    if (value !== "true" && value !== "1") throw new Error("from-stdin must be true or 1");
    spec.fromStdin = true;
  }
  else if (key === "prompt") {
    if (value !== "true" && value !== "1") throw new Error("prompt must be true or 1");
    spec.prompt = true;
  }
  else if (key === "fake-env") spec.fakeEnv = addFakeEnv(value, spec.fakeEnv);
  else throw new Error(`unknown credential spec key: ${key}`);
};

const parseCredentialSpec = (value: string) => {
  const spec = emptyCredentialSpec();
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error("--credential cannot be empty");
  for (const part of parts) {
    const [key, specValue] = splitSpecPart(part);
    addCredentialSpecPart(spec, key, specValue);
  }
  return spec;
};

const copyMatch = (match: CredentialVaultMatch): CredentialVaultMatch => ({
  hosts: [...match.hosts],
  schemes: match.schemes ? [...match.schemes] : undefined,
  methods: match.methods ? [...match.methods] : undefined,
  paths: match.paths ? [...match.paths] : undefined
});

const copySubstitutions = (auth: CredentialVaultAuth) =>
  auth.substitutions ? auth.substitutions.map((substitution) => ({ ...substitution, in: [...substitution.in] })) : undefined;

const copyAuth = (auth: CredentialVaultAuth): CredentialVaultAuth => {
  const substitutions = copySubstitutions(auth);
  if (auth.type === "bearer") return { ...auth, substitutions };
  if (auth.type === "basic") return { ...auth, substitutions };
  if (auth.type === "apiKey") return { ...auth, substitutions };
  if (auth.type === "customHeaders") {
    return {
      ...auth,
      headers: auth.headers.map((header) => ({ ...header })),
      substitutions
    };
  }
  return { ...auth, substitutions };
};

const copyBinding = (binding: CredentialVaultBinding): CredentialVaultBinding => ({
  name: binding.name,
  match: copyMatch(binding.match),
  auth: copyAuth(binding.auth)
});

const normalizeSchemes = (schemes: string[]) => {
  const normalized = schemes.map((scheme) => scheme.toLowerCase());
  if (normalized.some((scheme) => scheme !== "https" && scheme !== "http")) throw new Error("credential scheme must be http or https");
  return normalized as Array<"https" | "http">;
};

const normalizeMethods = (methods: string[]) => methods.map((method) => method.toUpperCase());

const storedCredentialFromSpec = (spec: ParsedCredentialSpec): HarakiriEncryptedSandboxCredentialBody => {
  if (spec.presetId || spec.hosts.length || spec.schemes.length || spec.methods.length || spec.paths.length) {
    throw new Error("secret-id credentials cannot also set preset, host, scheme, method, or path");
  }
  if (spec.fromEnv || spec.fromStdin || spec.prompt) {
    throw new Error("secret-id credentials use the stored value and cannot set from-env, from-stdin, or prompt");
  }
  if (Object.keys(spec.fakeEnv).length) {
    throw new Error("secret-id credentials use the stored fake env and cannot set fake-env");
  }
  if (spec.authFromUser || spec.headerFromUser) {
    throw new Error("secret-id credentials use the stored binding auth and cannot set auth or header");
  }
  return {
    sourceType: "harakiri_encrypted",
    secretId: spec.secretId ?? "",
    displayName: spec.displayName,
    credentialName: spec.credentialName,
    bindingName: spec.bindingName
  };
};

const externalCredentialFromSpec = (spec: ParsedCredentialSpec): ExternalReferenceSandboxCredentialBody => {
  if (spec.presetId || spec.hosts.length || spec.schemes.length || spec.methods.length || spec.paths.length) {
    throw new Error("reference-id credentials cannot also set preset, host, scheme, method, or path");
  }
  if (spec.fromEnv || spec.fromStdin || spec.prompt) {
    throw new Error("reference-id credentials resolve externally and cannot set from-env, from-stdin, or prompt");
  }
  if (Object.keys(spec.fakeEnv).length) {
    throw new Error("reference-id credentials use the external reference fake env and cannot set fake-env");
  }
  if (spec.authFromUser || spec.headerFromUser) {
    throw new Error("reference-id credentials use the external reference binding auth and cannot set auth or header");
  }
  return {
    sourceType: "external_ref",
    referenceId: spec.referenceId ?? "",
    displayName: spec.displayName,
    credentialName: spec.credentialName,
    bindingName: spec.bindingName
  };
};

const dynamicCredentialFromSpec = (spec: ParsedCredentialSpec): DynamicSandboxCredentialBody => {
  if (spec.presetId || spec.hosts.length || spec.schemes.length || spec.methods.length || spec.paths.length) {
    throw new Error("issuer-id credentials cannot also set preset, host, scheme, method, or path");
  }
  if (spec.fromEnv || spec.fromStdin || spec.prompt) {
    throw new Error("issuer-id credentials are minted dynamically and cannot set from-env, from-stdin, or prompt");
  }
  if (Object.keys(spec.fakeEnv).length) {
    throw new Error("issuer-id credentials use the issuer fake env and cannot set fake-env");
  }
  if (spec.authFromUser || spec.headerFromUser) {
    throw new Error("issuer-id credentials use the issuer binding auth and cannot set auth or header");
  }
  return {
    sourceType: "dynamic",
    issuerId: spec.issuerId ?? "",
    displayName: spec.displayName,
    credentialName: spec.credentialName,
    bindingName: spec.bindingName
  };
};

const assertSingleResolvedSource = (spec: ParsedCredentialSpec) => {
  if ([spec.secretId, spec.referenceId, spec.issuerId].filter(Boolean).length > 1) {
    throw new Error("credential spec must choose only one of secret-id, reference-id, or issuer-id");
  }
};

const credentialFromSpec = async (spec: ParsedCredentialSpec): Promise<AttachSandboxCredentialBody> => {
  assertSingleResolvedSource(spec);
  if (spec.secretId) return storedCredentialFromSpec(spec);
  if (spec.referenceId) return externalCredentialFromSpec(spec);
  if (spec.issuerId) return dynamicCredentialFromSpec(spec);
  const preset = spec.presetId ? credentialProviderPresetCatalog[spec.presetId] : undefined;
  const presetBinding = preset ? copyBinding(preset.binding) : undefined;
  const hosts = cleanList(spec.hosts.length ? spec.hosts : presetBinding?.match.hosts ?? []);
  if (!hosts.length) throw new Error("credential spec requires a preset=... or at least one host=...");
  const schemes = normalizeSchemes(cleanList(spec.schemes.length ? spec.schemes : presetBinding?.match.schemes ?? []));
  const methods = normalizeMethods(cleanList(spec.methods.length ? spec.methods : presetBinding?.match.methods ?? []));
  const paths = cleanList(spec.paths.length ? spec.paths : presetBinding?.match.paths ?? []);
  const auth = spec.authFromUser || spec.headerFromUser
    ? credentialAuthFromOptions({ auth: spec.auth, header: spec.header })
    : presetBinding?.auth ?? credentialAuthFromOptions({ auth: spec.auth, header: spec.header });
  return {
    displayName: spec.displayName ?? preset?.label,
    credentialName: spec.credentialName ?? preset?.credentialName,
    value: await secretFromOptions(spec),
    fakeEnv: { ...(preset?.fakeEnv ?? {}), ...spec.fakeEnv },
    binding: {
      name: spec.bindingName ?? presetBinding?.name,
      match: {
        hosts,
        schemes: schemes.length ? schemes as Array<"https" | "http"> : undefined,
        methods: methods.length ? methods : undefined,
        paths: paths.length ? paths : undefined
      },
      auth
    }
  };
};

const hasSlotMapping = (spec: ParsedCredentialSpec) => Boolean(spec.slotId || spec.slotProviderPresetId);

const ensureSlotMappingCanUseTemplateBinding = (spec: ParsedCredentialSpec) => {
  if (spec.presetId) throw new Error("slot credentials use slot-preset= for lookup and cannot also set preset=");
  if (spec.hosts.length || spec.schemes.length || spec.methods.length || spec.paths.length) {
    throw new Error("slot credentials use the template binding and cannot set host, scheme, method, or path");
  }
  if (spec.authFromUser || spec.headerFromUser) {
    throw new Error("slot credentials use the template binding auth and cannot set auth or header");
  }
};

const storedSlotSourceFromSpec = (spec: ParsedCredentialSpec): HarakiriEncryptedSandboxCredentialBody => {
  if (spec.fromEnv || spec.fromStdin || spec.prompt) {
    throw new Error("secret-id credentials use the stored value and cannot set from-env, from-stdin, or prompt");
  }
  if (Object.keys(spec.fakeEnv).length) {
    throw new Error("stored slot credentials use template fake env and cannot set fake-env");
  }
  return {
    sourceType: "harakiri_encrypted",
    secretId: spec.secretId ?? "",
    displayName: spec.displayName,
    credentialName: spec.credentialName,
    bindingName: spec.bindingName
  };
};

const externalSlotSourceFromSpec = (spec: ParsedCredentialSpec): ExternalReferenceSandboxCredentialBody => {
  if (spec.fromEnv || spec.fromStdin || spec.prompt) {
    throw new Error("reference-id credentials resolve externally and cannot set from-env, from-stdin, or prompt");
  }
  if (Object.keys(spec.fakeEnv).length) {
    throw new Error("external slot credentials use template fake env and cannot set fake-env");
  }
  return {
    sourceType: "external_ref",
    referenceId: spec.referenceId ?? "",
    displayName: spec.displayName,
    credentialName: spec.credentialName,
    bindingName: spec.bindingName
  };
};

const dynamicSlotSourceFromSpec = (spec: ParsedCredentialSpec): DynamicSandboxCredentialBody => {
  if (spec.fromEnv || spec.fromStdin || spec.prompt) {
    throw new Error("issuer-id credentials are minted dynamically and cannot set from-env, from-stdin, or prompt");
  }
  if (Object.keys(spec.fakeEnv).length) {
    throw new Error("dynamic slot credentials use template fake env and cannot set fake-env");
  }
  return {
    sourceType: "dynamic",
    issuerId: spec.issuerId ?? "",
    displayName: spec.displayName,
    credentialName: spec.credentialName,
    bindingName: spec.bindingName
  };
};

const inlineSlotSourceFromSpec = async (spec: ParsedCredentialSpec): Promise<InlineEphemeralTemplateCredentialSourceBody> => ({
  sourceType: "inline_ephemeral",
  displayName: spec.displayName,
  credentialName: spec.credentialName,
  bindingName: spec.bindingName,
  value: await secretFromOptions(spec),
  fakeEnv: Object.keys(spec.fakeEnv).length ? spec.fakeEnv : undefined
});

const slotSourceFromSpec = async (spec: ParsedCredentialSpec): Promise<TemplateCredentialSlotSourceBody> => {
  assertSingleResolvedSource(spec);
  if (spec.secretId) return storedSlotSourceFromSpec(spec);
  if (spec.referenceId) return externalSlotSourceFromSpec(spec);
  if (spec.issuerId) return dynamicSlotSourceFromSpec(spec);
  return inlineSlotSourceFromSpec(spec);
};

const credentialMappingFromSpec = async (spec: ParsedCredentialSpec): Promise<TemplateCredentialSlotMappingBody> => {
  ensureSlotMappingCanUseTemplateBinding(spec);
  return {
    slotId: spec.slotId,
    providerPresetId: spec.slotProviderPresetId,
    source: await slotSourceFromSpec(spec)
  };
};

export type CreateCredentialInputs = {
  credentials: AttachSandboxCredentialBody[];
  credentialMappings: TemplateCredentialSlotMappingBody[];
};

export const createCredentialInputsFromSpecs = async (values: string[] = []): Promise<CreateCredentialInputs> => {
  const specs = values.map(parseCredentialSpec);
  if (specs.filter((spec) => spec.fromStdin).length > 1) {
    throw new Error("only one create-time credential can use from-stdin=true");
  }
  const credentials: AttachSandboxCredentialBody[] = [];
  const credentialMappings: TemplateCredentialSlotMappingBody[] = [];
  for (const spec of specs) {
    if (hasSlotMapping(spec)) credentialMappings.push(await credentialMappingFromSpec(spec));
    else credentials.push(await credentialFromSpec(spec));
  }
  return { credentials, credentialMappings };
};

export const createCredentialsFromSpecs = async (values: string[] = []) => {
  const inputs = await createCredentialInputsFromSpecs(values);
  if (inputs.credentialMappings.length) {
    throw new Error("slot credentials can only be used during sandbox creation");
  }
  return inputs.credentials;
};

export const credentialFromDirectOptions = async (options: CredentialDirectOptions) => {
  const spec = emptyCredentialSpec();
  if (options.preset) spec.presetId = parseCredentialProviderPresetId(options.preset);
  spec.displayName = options.name;
  spec.credentialName = options.credentialName;
  spec.bindingName = options.bindingName;
  spec.hosts = options.host ?? [];
  spec.schemes = options.scheme ?? [];
  spec.methods = options.method ?? [];
  spec.paths = options.path ?? [];
  spec.fakeEnv = options.fakeEnv ?? {};
  spec.fromEnv = options.fromEnv;
  spec.fromStdin = options.fromStdin;
  spec.prompt = options.prompt;
  if (options.auth) {
    spec.auth = options.auth;
    spec.authFromUser = true;
  }
  if (options.header) {
    spec.header = options.header;
    spec.headerFromUser = true;
  }
  return credentialFromSpec(spec);
};
