export const REDACTED = "[redacted]";

const sensitiveKeyPattern = /(^|[_\-.])(api[_\-.]?key|auth|authorization|bearer|client[_\-.]?secret|credential|password|passwd|private[_\-.]?key|refresh[_\-.]?token|secret|token)([_\-.]|$)/i;

const textPatterns: Array<[RegExp, string]> = [
  [/\b(hk_(?:live|test)_[A-Za-z0-9._-]+)/g, REDACTED],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  [/\b(OPEN-SANDBOX-API-KEY|x-api-key|api[_-]?key|authorization|password|passwd|token|secret)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;'"]+)/gi, `$1=${REDACTED}`],
  [/(postgres(?:ql)?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, `$1${REDACTED}$3`],
  [/(https?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, `$1${REDACTED}$3`]
];

export const isSensitiveKey = (key: string) => sensitiveKeyPattern.test(key.replace(/([a-z])([A-Z])/g, "$1_$2"));

export const redactText = (value: string) => textPatterns.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);

export const redactStructured = (value: unknown): unknown => {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactStructured(item));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, isSensitiveKey(key) ? REDACTED : redactStructured(entry)])
  );
};

export const redactRecord = (value: Record<string, unknown>) => redactStructured(value) as Record<string, unknown>;
