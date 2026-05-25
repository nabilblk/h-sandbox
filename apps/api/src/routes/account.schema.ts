import { z } from "zod";

export const addOrganizationMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});
