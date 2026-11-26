import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30).nullable(),
    /** Put their own photo on business cards other businesses import. */
    sharePhotoOnCards: z.boolean(),
    settings: z.record(z.string(), z.unknown()),
  })
  .partial()
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
