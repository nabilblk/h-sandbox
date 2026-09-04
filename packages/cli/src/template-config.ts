import {
  credentialProviderPresetIds,
  egressModes,
  egressPresetIds,
  type CredentialProviderPresetId,
  type EgressMode,
  type EgressPolicyInput,
  type EgressPresetId,
  type TemplateCredentialSlotInput
} from "@h-sandbox/sdk";
import { parse as parseToml } from "smol-toml";

export type HarakiriTemplateConfig = {
  id?: string;
  name?: string;
  dockerfile?: string;
  visibility?: "public" | "private" | "internal";
  cpuCount?: number;
  memoryMb?: number;
  workdir?: string;
  ports?: number[];
  aliases?: string[];
  tags?: string[];
  image?: string;
  description?: string;
  runtimeFamily?: string;
  startCommand?: string;
  readyCommand?: string;
  credentialSlots?: TemplateCredentialSlotInput[];
  egressPolicy?: EgressPolicyInput;
};

type TomlRecord = Record<string, unknown>;

const hasOwn = (record: TomlRecord, key: string) => Object.prototype.hasOwnProperty.call(record, key);

const asRecord = (value: unknown, field: string): TomlRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be a TOML table`);
  }
  return value as TomlRecord;
};

const optionalString = (record: TomlRecord, key: string) => {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
};

const requiredString = (record: TomlRecord, key: string) => {
  const value = optionalString(record, key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};

const optionalInteger = (record: TomlRecord, key: string) => {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value as number;
};

const optionalBoolean = (record: TomlRecord, key: string) => {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
};

const optionalStringArray = (record: TomlRecord, key: string) => {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value;
};

const optionalIntegerArray = (record: TomlRecord, key: string) => {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => Number.isInteger(item))) {
    throw new Error(`${key} must be an array of integers`);
  }
  return value as number[];
};

const isCredentialProviderPresetId = (value: string): value is CredentialProviderPresetId =>
  credentialProviderPresetIds.includes(value as CredentialProviderPresetId);

const credentialSlotFromPresetId = (providerPresetId: string, required: boolean): TemplateCredentialSlotInput => {
  if (!isCredentialProviderPresetId(providerPresetId)) {
    throw new Error(`unknown credential provider preset in harakiri.toml: ${providerPresetId}`);
  }
  return { providerPresetId, required };
};

const structuredCredentialSlot = (value: unknown, index: number): TemplateCredentialSlotInput => {
  const field = `credential_slot[${index}]`;
  const slot = asRecord(value, field);
  const provider = requiredString(slot, "provider");
  const required = optionalBoolean(slot, "required") ?? true;
  const id = optionalString(slot, "id")?.trim() || undefined;
  const label = optionalString(slot, "label")?.trim() || undefined;
  const description = optionalString(slot, "description")?.trim() || undefined;
  const envName = optionalString(slot, "env_name")?.trim() || undefined;

  if (provider !== "custom") {
    if (!isCredentialProviderPresetId(provider)) {
      throw new Error(`${field}.provider is not a known credential provider: ${provider}`);
    }
    for (const key of ["host", "auth", "header", "methods", "paths", "test_path"]) {
      if (hasOwn(slot, key)) throw new Error(`${field}.${key} is only valid when provider = "custom"`);
    }
    return { id, providerPresetId: provider, required, label, description, envName };
  }

  if (!id) throw new Error(`${field}.id is required for a custom credential slot`);
  const auth = optionalString(slot, "auth") ?? "bearer";
  if (auth !== "bearer" && auth !== "api-key") {
    throw new Error(`${field}.auth must be bearer or api-key`);
  }
  const headerName = optionalString(slot, "header")?.trim() || undefined;
  if (auth === "api-key" && !headerName) throw new Error(`${field}.header is required for api-key auth`);
  if (auth === "bearer" && headerName) throw new Error(`${field}.header is not valid for bearer auth`);

  return {
    id,
    providerPresetId: "custom",
    required,
    label,
    description,
    envName,
    customProfile: {
      host: requiredString(slot, "host"),
      authType: auth === "api-key" ? "apiKey" : "bearer",
      headerName,
      methods: optionalStringArray(slot, "methods"),
      paths: optionalStringArray(slot, "paths"),
      envName,
      testPath: optionalString(slot, "test_path")?.trim() || undefined
    }
  };
};

const credentialSlotsFromConfig = (config: TomlRecord) => {
  const required = optionalStringArray(config, "credential_slots") ?? [];
  const optional = optionalStringArray(config, "optional_credential_slots") ?? [];
  const structured = config.credential_slot;
  if (structured !== undefined && !Array.isArray(structured)) {
    throw new Error("credential_slot must use the [[credential_slot]] array-of-tables form");
  }
  const slots = [
    ...required.map((provider) => credentialSlotFromPresetId(provider, true)),
    ...optional.map((provider) => credentialSlotFromPresetId(provider, false)),
    ...(structured ?? []).map(structuredCredentialSlot)
  ];
  const ids = new Set<string>();
  for (const slot of slots) {
    const id = slot.id ?? slot.providerPresetId;
    if (ids.has(id)) throw new Error(`duplicate credential slot in harakiri.toml: ${id}`);
    ids.add(id);
  }
  return slots;
};

const egressPolicyFromConfig = (config: TomlRecord): EgressPolicyInput | undefined => {
  const mode = optionalString(config, "egress_mode");
  if (mode !== undefined && !egressModes.includes(mode as EgressMode)) {
    throw new Error(`egress_mode must be one of: ${egressModes.join(", ")}`);
  }
  const presets = optionalStringArray(config, "egress_presets");
  if (presets?.some((preset) => !egressPresetIds.includes(preset as EgressPresetId))) {
    throw new Error("egress_presets contains an unknown preset");
  }
  const allow = optionalStringArray(config, "egress_allow");
  const deny = optionalStringArray(config, "egress_deny");
  const defaultAction = optionalString(config, "egress_default_action");
  if (defaultAction !== undefined && defaultAction !== "allow" && defaultAction !== "deny") {
    throw new Error("egress_default_action must be allow or deny");
  }
  if (mode === undefined && presets === undefined && allow === undefined && deny === undefined && defaultAction === undefined) {
    return undefined;
  }
  return {
    mode: mode as EgressMode | undefined,
    presets: presets as EgressPresetId[] | undefined,
    allow,
    deny,
    defaultAction
  };
};

const visibilityFromConfig = (config: TomlRecord) => {
  const visibility = optionalString(config, "visibility");
  if (visibility === undefined) return undefined;
  if (visibility !== "public" && visibility !== "private" && visibility !== "internal") {
    throw new Error("visibility must be public, private, or internal");
  }
  return visibility;
};

const withoutUndefined = <T extends TomlRecord>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined)
) as T;

export const parseHarakiriTemplateConfig = (input: string): HarakiriTemplateConfig => {
  let config: TomlRecord;
  try {
    config = asRecord(parseToml(input), "harakiri.toml");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid harakiri.toml: ${message}`);
  }

  const credentialSlots = credentialSlotsFromConfig(config);
  return withoutUndefined({
    id: optionalString(config, "id"),
    name: optionalString(config, "name"),
    dockerfile: optionalString(config, "dockerfile"),
    visibility: visibilityFromConfig(config),
    cpuCount: optionalInteger(config, "cpu_count"),
    memoryMb: optionalInteger(config, "memory_mb"),
    workdir: optionalString(config, "workdir"),
    ports: optionalIntegerArray(config, "ports"),
    aliases: optionalStringArray(config, "aliases"),
    tags: optionalStringArray(config, "tags"),
    image: optionalString(config, "image"),
    description: optionalString(config, "description"),
    runtimeFamily: optionalString(config, "runtime_family"),
    startCommand: optionalString(config, "start_command"),
    readyCommand: optionalString(config, "ready_command"),
    credentialSlots: credentialSlots.length ? credentialSlots : undefined,
    egressPolicy: egressPolicyFromConfig(config)
  });
};

export const commandToEntrypoint = (command?: string) => {
  const trimmed = command?.trim();
  if (!trimmed) return ["sleep", "3600"];
  return trimmed.match(/"([^"]*)"|'([^']*)'|\S+/g)?.map((part) => {
    if ((part.startsWith("\"") && part.endsWith("\"")) || (part.startsWith("'") && part.endsWith("'"))) return part.slice(1, -1);
    return part;
  }) ?? ["sleep", "3600"];
};
