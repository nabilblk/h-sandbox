import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const exec = promisify(execFile);
export const workspace = fileURLToPath(new URL('../', import.meta.url));
export const root = resolve(workspace, '../..');
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const fileHash = async (path: string) => sha256(await readFile(path));
export const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}
