import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, workspace } from './io.js';

export async function prepareAssets() {
  const publicDir = join(workspace, 'public');
  for (const dir of ['brand', 'fonts', 'design']) await mkdir(join(publicDir, dir), { recursive: true });
  await copyFile(join(root, 'apps/web/public/brand/mark-crimson.svg'), join(publicDir, 'brand/mark.svg'));
  for (const family of ['hanken-grotesk', 'jetbrains-mono']) {
    const name = `${family}-latin-wght-normal.woff2`;
    const source = join(workspace, 'node_modules/@fontsource-variable', family);
    await copyFile(join(source, 'files', name), join(publicDir, 'fonts', name));
    await copyFile(join(source, 'LICENSE'), join(publicDir, 'fonts', `${family}-LICENSE.txt`));
  }
  const css = await readFile(join(root, 'apps/web/src/styles.css'), 'utf8');
  const names = ['bg', 'surface', 'surface-2', 'ink', 'ink-2', 'muted', 'border', 'border-strong', 'accent'];
  const tokens = Object.fromEntries(names.map((name) => {
    const value = css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
    if (!value) throw new Error(`Missing Harakiri design token: ${name}`);
    return [name, value];
  }));
  await writeFile(join(publicDir, 'design/tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
}
