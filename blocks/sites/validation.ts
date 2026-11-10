import { z } from "zod";

const name = z.string().trim().min(1).max(120);
const address = z.string().trim().min(3).max(300);

export const createSiteSchema = z
  .object({ name, address, notes: z.string().trim().max(5000).optional() })
  .strict();

export const updateSiteSchema = z
  .object({ name, address, notes: z.string().trim().max(5000).nullable() })
  .partial()
  .strict();

export const addBuildingSchema = z.object({ name, kind: z.enum(["MULTI", "SINGLE"]) }).strict();
export const renameSchema = z.object({ name }).strict();

export const addLevelsSchema = z
  .object({
    /** Top first, e.g. ["Roof", "Level 7", … "Ground"]. */
    names: z.array(z.string().trim().min(1).max(60)).min(1).max(150),
    position: z.enum(["above", "below"]).default("above"),
  })
  .strict();

export const updateLevelSchema = z
  .object({ name: z.string().trim().min(1).max(60), shortName: z.string().trim().max(8).optional() })
  .strict();

export const moveLevelSchema = z.object({ direction: z.enum(["up", "down"]) }).strict();

export const listSitesQuery = z.object({
  tab: z.enum(["active", "mine", "archived"]).default("active"),
  q: z.string().max(200).optional(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type AddBuildingInput = z.infer<typeof addBuildingSchema>;
export type AddLevelsInput = z.infer<typeof addLevelsSchema>;
