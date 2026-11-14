import { z } from "zod";

const uuid = z.string().uuid();
const area = { buildingId: uuid.nullable().optional(), levelId: uuid.nullable().optional() };
/** A photo pin: the plan sheet and the spot on it, in sheet units. */
const pin = z.object({ sheetId: uuid, x: z.number().finite().min(-1).max(10), y: z.number().finite().min(-1).max(10) }).strict();

export const addPhotoSchema = z
  .object({
    id: uuid,
    projectId: uuid,
    fileId: uuid,
    ...area,
    caption: z.string().trim().max(1000).optional(),
    tag: z.enum(["NONE", "BEFORE", "AFTER"]).default("NONE"),
    takenAt: z.coerce.date().optional(),
    pin: pin.optional(),
  })
  .strict();

export const updatePhotoSchema = z
  .object({
    caption: z.string().trim().max(1000).nullable(),
    tag: z.enum(["NONE", "BEFORE", "AFTER"]),
    ...area,
    /** Pin it to a spot on a plan, or null to take the pin off. */
    pin: pin.nullable(),
  })
  .partial()
  .strict();

export const pinsQuery = z.object({ job: uuid });

export const addNoteSchema = z.object({ projectId: uuid, ...area, body: z.string().trim().min(1).max(10000) }).strict();
export const updateNoteSchema = z.object({ body: z.string().trim().min(1).max(10000) }).strict();

export const restoreSchema = z.object({ kind: z.enum(["photo", "note"]), id: uuid }).strict();
export const deleteNowSchema = z
  .object({ photoIds: z.array(uuid).max(1000).default([]), noteIds: z.array(uuid).max(1000).default([]) })
  .strict();

export const feedQuery = z.object({
  building: uuid.optional(),
  level: uuid.optional(),
  tag: z.enum(["NONE", "BEFORE", "AFTER"]).optional(),
});

export type AddPhotoInput = z.infer<typeof addPhotoSchema>;
export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
