import { config } from "../../config.js";
import { callOpenSandbox, callOpenSandboxText, joinUrl, openSandboxHeaders } from "./opensandbox-client.js";
import type { DiagnosticContent, SandboxLogEntry } from "./opensandbox-types.js";

const diagnosticContentUrl = (contentUrl: string) => {
  if (/^https?:\/\//.test(contentUrl)) return contentUrl;
  return joinUrl(config.openSandboxBaseUrl, contentUrl);
};

const loadDiagnosticText = async (descriptor: DiagnosticContent) => {
  if (typeof descriptor.content === "string") return descriptor.content;
  if (!descriptor.contentUrl) return "";
  const url = diagnosticContentUrl(descriptor.contentUrl);
  const sameOpenSandboxOrigin = (() => {
    try {
      return new URL(url).origin === new URL(config.openSandboxBaseUrl).origin;
    } catch {
      return false;
    }
  })();
  const response = await fetch(url, { headers: sameOpenSandboxOrigin ? openSandboxHeaders() : undefined });
  if (!response.ok) return "";
  return response.text();
};

export const sandboxLogs = async (opensandboxId: string): Promise<SandboxLogEntry[]> => {
  const descriptor = await callOpenSandbox<DiagnosticContent>(
    `/v1/sandboxes/${opensandboxId}/diagnostics/logs?scope=container`
  ).catch(() => null);
  const stableText = descriptor ? await loadDiagnosticText(descriptor).catch(() => "") : "";
  const legacyText = stableText
    ? ""
    : await callOpenSandboxText(`/v1/sandboxes/${opensandboxId}/diagnostics/logs?tail=200`).catch(() => "");
  const text = stableText || legacyText;
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = /^(\S+)\s+(.*)$/.exec(line);
      let ts = match?.[1] && !Number.isNaN(Date.parse(match[1])) ? match[1] : new Date().toISOString();
      let lvl = "runtime";
      let msg = match?.[2] ?? line;
      try {
        const payload = JSON.parse(msg) as { ts?: string; level?: string; msg?: string };
        if (payload.ts && !Number.isNaN(Date.parse(payload.ts))) ts = payload.ts;
        if (payload.level) lvl = payload.level;
        if (payload.msg) msg = payload.msg;
      } catch {
        // Non-JSON container log lines are still useful runtime logs.
      }
      return {
        ts,
        lvl,
        msg,
        source: "sandbox" as const
      };
    });
};
