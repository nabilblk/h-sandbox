// Resolves frontend configuration at runtime so a single published web image
// works in any environment. Precedence:
//   1. window.__HARAKIRI_CONFIG__  — injected by /config.js, which the container
//      entrypoint regenerates from environment variables at startup.
//   2. import.meta.env             — Vite build-time values (local dev + fallback).
//
// Consumers read keys like PUBLIC_API_URL / PUBLIC_KEYCLOAK_URL (with the
// VITE_PUBLIC_* fallbacks) off the exported `env` object, exactly as before.

type ConfigRecord = Record<string, string | undefined>;

declare global {
  interface Window {
    __HARAKIRI_CONFIG__?: ConfigRecord;
  }
}

const buildEnv = (import.meta.env ?? {}) as ConfigRecord;

const runtimeEnv: ConfigRecord =
  typeof window !== "undefined" && window.__HARAKIRI_CONFIG__ ? window.__HARAKIRI_CONFIG__ : {};

// Drop empty values so an unset runtime placeholder never shadows a build default.
const withoutEmpty = (record: ConfigRecord): ConfigRecord => {
  const result: ConfigRecord = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value !== undefined && value !== "") result[key] = value;
  }
  return result;
};

// Runtime config wins over build-time env.
export const env: ConfigRecord = { ...buildEnv, ...withoutEmpty(runtimeEnv) };
