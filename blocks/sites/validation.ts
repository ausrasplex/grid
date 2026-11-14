import { z } from "zod";

const name = z.string().trim().min(1).max(120);
const address = z.string().trim().min(3).max(300);

export const createSiteSchema = z.object({ name, address }).strict();

export const updateSiteSchema = z.object({ name, address }).partial().strict();

/** A site note: a title ("Lockbox") and the details ("Code 4512, left of the gate"). */
export const siteNoteSchema = z
  .object({
    title: z.string().trim().min(1, "Give the note a title").max(80),
    body: z.string().trim().max(5000).default(""),
  })
  .strict();

/** The notes in their new order (every note on the site, by id). */
export const siteNoteOrderSchema = z.object({ ids: z.array(z.string().uuid()).max(500) }).strict();

export const addBuildingSchema = z.object({ name, kind: z.enum(["MULTI", "SINGLE"]) }).strict();
export const renameSchema = z.object({ name }).strict();

export const addLevelsSchema = z
  .object({
    /** Top first, e.g. ["Roof", "Level 7", … "Ground"]. */
    names: z.array(z.string().trim().min(1).max(60)).min(1).max(150),
    position: z.enum(["above", "below"]).default("above"),
    /** What the new level is used for (one level at a time). */
    use: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

export const updateLevelSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    shortName: z.string().trim().max(8).optional(),
    /** "Plant room", "Retail"…; empty clears it. */
    use: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

export const moveLevelSchema = z.object({ direction: z.enum(["up", "down"]) }).strict();

/** "Used for" on several floors at once: by id (a range picked on screen) or by name (just added). */
export const levelsUseSchema = z
  .object({
    levelIds: z.array(z.string().uuid()).max(500).optional(),
    names: z.array(z.string().trim().min(1).max(60)).max(500).optional(),
    /** "Car park"; empty or null clears it. */
    use: z.string().trim().max(40).nullable(),
  })
  .strict()
  .refine((value) => (value.levelIds?.length ?? 0) + (value.names?.length ?? 0) > 0, "Pick the floors");

export const listSitesQuery = z.object({
  tab: z.enum(["active", "mine", "archived"]).default("active"),
  q: z.string().max(200).optional(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type AddBuildingInput = z.infer<typeof addBuildingSchema>;
export type AddLevelsInput = z.infer<typeof addLevelsSchema>;
export type SiteNoteInput = z.infer<typeof siteNoteSchema>;
