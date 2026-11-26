import { z } from "zod";

const uuid = z.string().uuid();
const area = { buildingId: uuid.nullable().optional(), levelId: uuid.nullable().optional() };
/** A photo pin: the plan sheet and the spot on it, in sheet units. */
const pin = z
  .object({
    sheetId: uuid,
    x: z.number().finite().min(-1).max(10),
    y: z.number().finite().min(-1).max(10),
    /** The sheet layer it's on (null = Default); left out when moving keeps it. */
    layerId: uuid.nullable().optional(),
  })
  .strict();

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
    /** On a placed icon on a plan (a markup id) instead of a pin. */
    markupId: uuid.optional(),
    /** The first note on the photo, typed when it was taken (e.g. when pinning it on a plan). */
    note: z.string().trim().max(10000).optional(),
  })
  .strict()
  .refine((input) => !(input.pin && input.markupId), { message: "A photo goes on an icon or a pin, not both", path: ["markupId"] });

export const updatePhotoSchema = z
  .object({
    caption: z.string().trim().max(1000).nullable(),
    tag: z.enum(["NONE", "BEFORE", "AFTER"]),
    ...area,
    /** Pin it to a spot on a plan, or null to take the pin off. */
    pin: pin.nullable(),
    /** Null takes it off its icon (it stays in the job's photos). */
    markupId: z.null(),
  })
  .partial()
  .strict();

export const pinsQuery = z.object({ job: uuid });

/** A note on a photo. */
export const photoNoteSchema = z.object({ body: z.string().trim().min(1, "Type a note").max(10000) }).strict();

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
