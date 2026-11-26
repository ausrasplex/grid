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
    /** "Track tests and servicing"; stays on while its category has routines. */
    serviceEnabled: z.boolean().optional(),
  })
  .strict();

export const fieldSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["text", "number", "date", "yesno"]),
});

/** A routine (§4): test & tag every 3 months, must pass; a service every 12. */
export const routineSchema = z
  .object({
    /** Kept when changing a category's routine, so its log and due dates follow. */
    id: uuid.nullish(),
    name: z.string().trim().min(1, "Give the routine a name").max(80),
    everyMonths: z.coerce.number().int().min(1).max(240).nullish(),
    mustPass: z.boolean().default(false),
    notes: optText(1000),
  })
  .strict();

export const categorySchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(80),
    fields: z.array(fieldSchema).max(30).default([]),
    /** Routines every asset in it follows. Left out: unchanged. */
    routines: z.array(routineSchema).max(20).optional(),
  })
  .strict();

export const presetSchema = z.object({ names: z.array(z.string().trim().min(1).max(80)).min(1).max(30) }).strict();

export const listQuery = z.object({
  q: z.string().optional(),
  category: z.union([uuid, z.literal("none")]).optional(),
  /** "active" (default: everything not retired), "mine" (what you have now), "retired" or "all". */
  show: z.enum(["active", "mine", "due", "retired", "all"]).optional(),
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

export const faultSchema = z
  .object({
    type: z.enum(["FAULTY", "DAMAGED", "MISSING_PARTS", "FAILED_TEST", "OTHER"]),
    doNotUse: z.boolean().default(false),
    note: optText(2000),
    photoFileIds: z.array(uuid).max(20).default([]),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
    /** Add to this open report instead of making a new one. */
    addTo: uuid.nullish(),
    /** Report a new fault even though one is open. */
    anyway: z.boolean().default(false),
  })
  .strict();

export const faultStepSchema = z.object({ status: z.enum(["ACKNOWLEDGED", "IN_REPAIR", "FIXED", "RETIRED"]).nullish(), note: optText(2000) }).strict();

export const lostSchema = z
  .object({
    kind: z.enum(["LOST", "STOLEN"]),
    lastKnown: optText(500),
    note: optText(2000),
    policeReport: optText(60),
  })
  .strict();

/** Log a test, inspection or service done (§4). */
export const checkSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it was done"),
    routineIds: z.array(uuid).max(20).default([]),
    title: z.string().trim().min(1, "Say what was done").max(200),
    result: z.enum(["PASS", "FAIL"]).default("PASS"),
    doneBy: optText(200),
    tagColour: z.enum(["RED", "GREEN", "BLUE", "YELLOW"]).nullish().transform((value) => value ?? null),
    cost: z
      .union([z.number(), z.string()])
      .nullish()
      .transform((value, context) => {
        if (value === null || value === undefined || value === "") return null;
        const number = typeof value === "number" ? value : Number(value.replace(/[$,\s]/g, ""));
        if (!Number.isFinite(number) || number < 0) {
          context.addIssue({ code: "custom", message: "The cost must be a number" });
          return z.NEVER;
        }
        return Math.round(number * 100) / 100;
      }),
    fileIds: z.array(uuid).max(20).default([]),
    notes: optText(4000),
  })
  .strict();

/** Book one in: the day, what for, and where or who. */
export const bookingSchema = z
  .object({
    routineIds: z.array(uuid).min(1, "Pick what it's booked in for").max(20),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day it's booked for"),
    withWho: optText(200),
  })
  .strict();

export type RoutineInput = z.infer<typeof routineSchema>;
export type CheckInput = z.infer<typeof checkSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type AssetInput = z.infer<typeof assetSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ListQuery = z.infer<typeof listQuery>;
export type StickerQuery = z.infer<typeof stickerQuery>;
export type StickerSettingsInput = z.infer<typeof stickerSettingsSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
export type FaultInput = z.infer<typeof faultSchema>;
export type FaultStepInput = z.infer<typeof faultStepSchema>;
export type LostInput = z.infer<typeof lostSchema>;
