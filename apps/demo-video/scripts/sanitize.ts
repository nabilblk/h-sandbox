import { stripVTControlCharacters } from 'node:util';

const secretPatterns = [
  /hk_(?:live|test)_[a-zA-Z0-9_-]+/g,
  /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /SG\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /(?:sk|ghp|github_pat)[_-][a-zA-Z0-9_-]{16,}/g,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /(?:\/Users\/|\/home\/)[a-zA-Z0-9._-]+/g,
  /(?:Bearer|Basic)\s+[a-zA-Z0-9+/_=.-]{12,}/g,
  /(?:harakiri_route_token|access_token|refresh_token|id_token|password|client_secret|code)=[^\s&"<>]+/gi,
  /(?<=\trunning\t)[a-f0-9]{32}(?=\n|$)/g,
  /(?:set-cookie|cookie|authorization|x-api-key)\s*[:=]\s*[^\r\n]+/gi,
];

export function sanitize(text: string, secrets: string[] = []): string {
  let result = stripVTControlCharacters(text).replace(/\r/g, '');
  for (const secret of secrets.filter((item) => item.length >= 4).sort((a, b) => b.length - a.length)) result = result.split(secret).join('[redacted]');
  for (const pattern of secretPatterns) result = result.replace(pattern, '[redacted]');
  return result;
}

// These are synthetic in-sandbox fixture addresses, never host origin forwards.
export const sandboxExampleOrigins = ['http://127.0.0.1:3000', 'http://127.0.0.1:3001'];

export function assertSanitized(text: string, origins: string[], examples: string[] = []) {
  if (sanitize(text) !== text) throw new Error('Capture includes forbidden credential or personal-data text');
  if (examples.some((origin) => !sandboxExampleOrigins.includes(origin))) throw new Error('Unapproved example endpoint');
  const allowed = new Set([...origins, ...examples].map((origin) => new URL(origin).origin));
  const infrastructure = text.replace(/https?:\/\/[^\s"'<>\\]+/g, (match) => {
    const url = new URL(match);
    if (url.username || url.password || url.search || !allowed.has(url.origin)) throw new Error('Capture includes an unapproved URL');
    return examples.includes(url.origin) ? '[sandbox fixture URL]' : match;
  });
  if (/localhost|127\.0\.0\.1|\.svc(?:\.|:)|\.internal\b|apps-crc|core\.campus|\/var\/folders\/|\b(?:10|192\.168|169\.254|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+/i.test(infrastructure)) throw new Error('Capture includes a private endpoint or local path');
}
