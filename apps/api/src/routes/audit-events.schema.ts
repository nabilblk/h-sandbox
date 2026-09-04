import { z } from "zod";

const optionalFilter = z.string().trim().min(1).max(160).optional();

export const auditEventListQuerySchema = z.object({
  targetType: optionalFilter,
  targetId: optionalFilter,
  actionPrefix: optionalFilter,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();
