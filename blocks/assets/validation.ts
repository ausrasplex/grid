import { z } from "zod";

const uuid = z.string().uuid();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .nullish()
  .transform((value) => value || null);

export const assetSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(200),
    /** Blank for the next number. */
    number: z.number().int().min(1).max(9_999_999).nullish(),
    categoryId: uuid.nullish().transform((value) => value ?? null),
    make: optText(120),
    model: optText(120),
    serial: optText(120),
    purchasedOn: day,
    photoFileIds: z.array(uuid).max(20).default([]),
    notes: optText(4000),
    fields: z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).default({}),
    barcode: optText(200),
  })
  .strict();

export const fieldSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["text", "number", "date", "yesno"]),
});

export const categorySchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(80),
    fields: z.array(fieldSchema).max(30).default([]),
  })
  .strict();

export const presetSchema = z.object({ names: z.array(z.string().trim().min(1).max(80)).min(1).max(30) }).strict();

export const listQuery = z.object({
  q: z.string().optional(),
  category: z.union([uuid, z.literal("none")]).optional(),
  /** "active" (default: everything not retired), "mine" (what you have now), "retired" or "all". */
  show: z.enum(["active", "mine", "retired", "all"]).optional(),
});

export const statusSchema = z.object({ status: z.enum(["IN_SERVICE", "RETIRED"]) }).strict();

const mm = (max: number) => z.coerce.number().min(0).max(max);

export const customLayoutSchema = z.object({
  paper: z.enum(["a4", "roll"]),
  columns: z.coerce.number().int().min(1).max(10),
  rows: z.coerce.number().int().min(1).max(30),
  width: z.coerce.number().min(10).max(210),
  height: z.coerce.number().min(8).max(297),
  top: mm(150),
  left: mm(100),
  gapX: mm(50),
  gapY: mm(50),
});

export const stickerSettingsSchema = z
  .object({
    layout: z.string().min(1).max(40),
    custom: customLayoutSchema.nullish(),
    offsetX: z.coerce.number().min(-10).max(10).default(0),
    offsetY: z.coerce.number().min(-10).max(10).default(0),
  })
  .strict();

export const stickerQuery = z.object({
  ids: z.string().min(1),
  layout: z.string().min(1).max(40).default("a4-21"),
  /** Leave the first few spaces on a part-used sheet empty (1 = the first space). */
  start: z.coerce.number().int().min(1).max(300).default(1),
});

const where = {
  projectId: uuid.nullish(),
  buildingId: uuid.nullish(),
  levelId: uuid.nullish(),
  note: optText(500),
};

/** Check out: to you (no userId) or someone else (assets.assign), optionally on a job. */
export const checkOutSchema = z.object({ userId: z.string().min(1).max(100).nullish(), ...where }).strict();

/** Return: to a store, a van (by name) or left on a job. */
export const returnSchema = z.object({ where: z.enum(["STORE", "VEHICLE", "PROJECT"]), label: optText(60), ...where }).strict();

export const takeOverSchema = z.object({ note: optText(500) }).strict();

export type AssetInput = z.infer<typeof assetSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ListQuery = z.infer<typeof listQuery>;
export type StickerQuery = z.infer<typeof stickerQuery>;
export type StickerSettingsInput = z.infer<typeof stickerSettingsSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
