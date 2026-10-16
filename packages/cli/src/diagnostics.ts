import { HarakiriApiError, HarakiriClient } from "@h-sandbox/sdk";
import { loadConfig } from "./config.js";

type Check = { name: string; status: "pass" | "fail"; message: string };

export function publicHttpUrl(value: string): URL {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Use an HTTP(S) base URL without credentials, query parameters or a fragment.");
  }
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Use HTTPS, or HTTP on a local loopback address.");
  }
  return url;
}

export function workbenchLink(base: string, id: string) {
  const url = publicHttpUrl(base);
  url.hash = `dashboard/sandboxes/${encodeURIComponent(id)}?tab=overview`;
  return url.href;
}

// Provider bodies and connection errors can contain secrets. Diagnostics use
// controlled messages, not arbitrary remote error text or configuration dumps.
function diagnosticError(error: unknown) {
  if (error instanceof HarakiriApiError) {
    if (error.status === 401) return "Authentication rejected. Check the configured API key and its expiry.";
    if (error.status === 403) return "Access denied. Check API key scopes and organization membership.";
    if (error.status === 404) return "Not found or not visible to this principal. Check the sandbox ID and organization.";
    return `API returned HTTP ${error.status}. Check API and provider health.`;
  }
  return "Request failed or timed out. Check the API URL, TLS trust and network connectivity.";
}

export async function diagnose(sandboxId?: string, timeoutMs = 10_000) {
  const checks: Check[] = [];
  let client: HarakiriClient;
  let apiUrl: string;
  try {
    const config = await loadConfig();
    apiUrl = publicHttpUrl(config.apiUrl).href.replace(/\/$/, "");
    if (!config.apiKey?.trim()) throw new Error("missing key");
    client = new HarakiriClient({ apiUrl, apiKey: config.apiKey, requestTimeoutMs: timeoutMs });
    checks.push({ name: "configuration", status: "pass", message: "API URL and key are configured. Key value is not displayed." });
  } catch {
    checks.push({ name: "configuration", status: "fail", message: "Check HARAKIRI_API_URL and HARAKIRI_API_KEY, or the saved CLI configuration. Use HTTPS (HTTP is allowed on loopback only); omit credentials, query and fragment from the URL." });
    return { ok: false, checks };
  }
  try {
    const { capacity } = await client.capacity();
    checks.push({ name: "capacity-access", status: "pass", message: `Authenticated capacity read succeeded; capacity is ${capacity.state}. Other permissions and runtime availability are not implied.` });
  } catch (error) {
    checks.push({ name: "capacity-access", status: "fail", message: diagnosticError(error) });
  }
  if (sandboxId) {
    try {
      const { readiness } = await client.sandboxes.readiness(sandboxId);
      checks.push({ name: "execution-readiness", status: readiness.status === "ready" ? "pass" : "fail", message: `Execution is ${readiness.status}. Inspect sandbox logs and capabilities for details.` });
    } catch (error) {
      checks.push({ name: "execution-readiness", status: "fail", message: diagnosticError(error) });
    }
  }
  return { ok: checks.every((check) => check.status === "pass"), apiUrl, checks };
}
