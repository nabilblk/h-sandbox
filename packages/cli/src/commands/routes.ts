import { spawn } from "node:child_process";
import type { Command } from "commander";
import { apiClient } from "../config.js";
import { progressLine } from "../format.js";
import { collectString, parsePort, parsePositiveInt, printProgress } from "../utils.js";

const parseProtocol = (value: string): "http" | "https" => {
  if (value !== "http" && value !== "https") throw new Error("--protocol must be http or https");
  return value;
};

const parseAccessMode = (value: string): "public" | "token" => {
  if (value !== "public" && value !== "token") throw new Error("--access must be public or token");
  return value;
};

const appendRouteToken = (url: string, token?: string) => {
  if (!token) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("harakiri_route_token", token);
  return parsed.toString();
};

const openInBrowser = (url: string) => {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
};

const printRouteProgress = (line: string, json: boolean) => {
  if (json) process.stderr.write(`${progressLine(line)}\n`);
  else printProgress(line);
};

const routeWaitDisplayUrl = (routeUrl: string, path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ""), `${routeUrl.replace(/\/+$/, "")}/`).toString();
};

export const registerRouteCommands = (program: Command) => {
  program
    .command("expose")
    .argument("<id>", "sandbox id")
    .description("Expose a sandbox HTTP port")
    .requiredOption("--port <port>", "port inside the sandbox", parsePort)
    .option("--protocol <protocol>", "route protocol: http or https", parseProtocol, "http")
    .option("--access <mode>", "route access mode: public or token", parseAccessMode, "public")
    .option("--label <label>", "route label; can be repeated", collectString, [])
    .option("--wait", "wait until the exposed HTTP route responds successfully")
    .option("--wait-path <path>", "HTTP path used with --wait", "/")
    .option("--wait-timeout-ms <ms>", "maximum route readiness wait", parsePositiveInt, 30000)
    .option("--wait-interval-ms <ms>", "route readiness poll interval", parsePositiveInt, 500)
    .option("--expect-status <status>", "HTTP status expected by --wait", parsePositiveInt)
    .option("--open", "open the route URL in the default browser after exposing")
    .option("--open-with-token-query", "when used with --open on a token route, put the one-time token in the query string")
    .option("--json", "print the route response as JSON")
    .action(async (id, options) => {
      printRouteProgress(`exposing port ${options.port}`, Boolean(options.json));
      const client = await apiClient();
      const accessMode = parseAccessMode(options.access);
      const labels = (options.label as string[]).map((label) => label.trim()).filter(Boolean);
      const result = await client.exposePort(id, { port: options.port, protocol: options.protocol, accessMode, labels: labels.length ? labels : undefined });
      if (options.wait) {
        printRouteProgress(`waiting for ${routeWaitDisplayUrl(result.route.url, options.waitPath)}`, Boolean(options.json));
        await client.routes.waitForHttp(result, {
          path: options.waitPath,
          timeoutMs: options.waitTimeoutMs,
          intervalMs: options.waitIntervalMs,
          expect: options.expectStatus ? (response) => response.status === options.expectStatus : undefined
        });
      }
      printRouteProgress(`${result.route.state}. provider=${result.route.provider}. access=${result.route.accessMode}`, Boolean(options.json));
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.route.url);
        if (result.accessToken && result.accessHeaderName) {
          console.log(`${result.accessHeaderName}: ${result.accessToken}`);
        }
      }
      if (options.open) {
        const browserUrl = appendRouteToken(result.route.url, options.openWithTokenQuery ? result.accessToken : undefined);
        openInBrowser(browserUrl);
        printProgress(`opened ${result.route.accessMode === "token" && !options.openWithTokenQuery ? "without route token query. Pass --open-with-token-query if this browser request must authenticate." : browserUrl}`);
      }
    });

  program
    .command("routes")
    .argument("<id>", "sandbox id")
    .description("List exposed sandbox ports")
    .option("--json", "print routes as JSON")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.listRoutes(id);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      for (const route of result.routes) {
        console.log(`${route.port}\t${route.state}\t${route.accessMode}\t${route.tokenHint ?? "-"}\t${route.provider}\t${route.labels.join(",") || "-"}\t${route.url}`);
      }
    });

  program
    .command("open")
    .argument("<id>", "sandbox id")
    .requiredOption("--port <port>", "port inside the sandbox", parsePort)
    .option("--token <token>", "one-time token for token-protected routes; appended as a query parameter")
    .description("Open an exposed sandbox route in the default browser")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.listRoutes(id);
      const route = result.routes.find((entry) => entry.port === options.port);
      if (!route) throw new Error(`route for port ${options.port} was not found`);
      const browserUrl = appendRouteToken(route.url, options.token);
      console.log(browserUrl);
      openInBrowser(browserUrl);
      if (route.accessMode === "token" && !options.token) {
        printProgress(`token route opened without a token. Use --token with the one-time token printed by harakiri expose.`);
      }
    });

  program
    .command("unexpose")
    .argument("<id>", "sandbox id")
    .requiredOption("--port <port>", "port inside the sandbox", parsePort)
    .description("Delete an exposed sandbox port")
    .action(async (id, options) => {
      const client = await apiClient();
      const result = await client.deleteRoute(id, options.port);
      printProgress(`${result.route.port} ${result.route.state}`);
    });
};
