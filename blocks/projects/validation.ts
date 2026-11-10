import { z } from "zod";

const cover = z.object({ buildingId: z.string().uuid(), levelId: z.string().uuid().nullable().optional() }).strict();

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    clientName: z.string().trim().max(160).optional(),
    description: z.string().trim().max(5000).optional(),
    jobNumber: z.string().trim().max(40).optional(),
    /** Either an existing site… */
    siteId: z.string().uuid().optional(),
    /** …or an address (finds or makes a private site). */
    address: z.string().trim().min(3).max(300).optional(),
    covers: z.array(cover).max(500).optional(),
    /** More numbers to find the job by, e.g. { label: "Quote", value: "Q-1001" }. */
    references: z.array(z.object({ label: z.string().trim().min(1).max(30), value: z.string().trim().min(1).max(60) }).strict()).max(5).optional(),
  })
  .strict()
  .refine((value) => !!value.siteId !== !!value.address, "Give an address or pick a site (not both)");

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    clientName: z.string().trim().max(160).nullable(),
    description: z.string().trim().max(5000).nullable(),
    jobNumber: z.string().trim().min(1).max(40),
    listing: z.enum(["LISTED", "UNLISTED"]),
    covers: z.array(cover).min(1).max(500),
  })
  .partial()
  .strict();

export const statusSchema = z.object({ status: z.enum(["ACTIVE", "COMPLETED"]) }).strict();

export const areaSchema = z
  .object({ buildingId: z.string().uuid(), levelId: z.string().uuid().nullable() })
  .strict();

export type CoverInput = z.infer<typeof cover>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
