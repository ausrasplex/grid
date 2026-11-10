import { z } from "zod";

const sheetNumberField = z.string().trim().min(1, "Give the sheet a number").max(40);
const revisionSchema = z.string().trim().max(12).transform((value) => value.toUpperCase());

export const previewSchema = z.object({ fileIds: z.array(z.uuid()).min(1).max(200) }).strict();

export const importRowSchema = z
  .object({
    fileId: z.uuid(),
    page: z.number().int().min(1).max(2000),
    action: z.enum(["new", "revise", "skip"]),
    /** For "revise": the sheet it's a new revision of. */
    sheetId: z.uuid().nullable().optional(),
    number: sheetNumberField,
    title: z.string().trim().max(160).default(""),
    revision: revisionSchema.default(""),
    discipline: z.string().trim().max(4).default(""),
    makeCurrent: z.boolean().default(true),
  })
  .strict();
export const importSchema = z.object({ rows: z.array(importRowSchema).min(1).max(2000) }).strict();

export const updateSheetSchema = z
  .object({
    number: sheetNumberField,
    title: z.string().trim().max(160),
    discipline: z.string().trim().max(4),
    buildingId: z.uuid().nullable(),
    levelId: z.uuid().nullable(),
  })
  .partial()
  .strict();

export const currentSchema = z.object({ versionId: z.uuid() }).strict();
export const updateVersionSchema = z.object({ revision: revisionSchema, note: z.string().trim().max(500).nullable() }).partial().strict();

export type ImportRow = z.infer<typeof importRowSchema>;
export type UpdateSheetInput = z.infer<typeof updateSheetSchema>;
