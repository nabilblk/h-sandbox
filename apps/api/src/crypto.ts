import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const makeId = (prefix: string, length = 10) =>
  `${prefix}_${randomBytes(length).toString("base64url").slice(0, length)}`;

export const createApiKey = (mode: "live" | "test" = "live") => {
  const token = `hk_${mode}_${randomBytes(28).toString("base64url")}`;
  return {
    token,
    prefix: token.slice(0, 12),
    lastFour: token.slice(-4),
    hash: hashApiKey(token)
  };
};

export const hashApiKey = (key: string) =>
  createHash("sha256").update(key, "utf8").digest("hex");

export const constantEquals = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

