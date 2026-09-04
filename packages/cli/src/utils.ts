import { progressLine } from "./format.js";

export const printProgress = (line: string) => console.log(progressLine(line));

export const templateIdFor = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "custom-template";

export const tomlString = (value: string) => JSON.stringify(value);

export const tomlArray = (values: Array<string | number>) =>
  `[${values.map((value) => typeof value === "number" ? value : tomlString(value)).join(", ")}]`;

export const uniqueStrings = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

export const collectPort = (value: string, previous: number[]) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be an integer from 1 to 65535");
  return [...previous, port];
};

export const collectString = (value: string, previous: string[]) => [...previous, value];

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const collectEnv = (value: string, previous: Record<string, string> = {}) => {
  const index = value.indexOf("=");
  if (index <= 0) throw new Error("--env must be formatted as KEY=value");
  const key = value.slice(0, index);
  if (!envNamePattern.test(key)) throw new Error("--env key must match [A-Za-z_][A-Za-z0-9_]*");
  return { ...previous, [key]: value.slice(index + 1) };
};

export const parsePositiveInt = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("expected a positive integer");
  return parsed;
};

export const parseNonNegativeInt = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("expected a non-negative integer");
  return parsed;
};

export const parsePort = (value: string) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be an integer from 1 to 65535");
  return port;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
