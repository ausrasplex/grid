import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const qty = z
  .union([z.number(), z.string().trim()])
  .nullish()
  .transform((value, context) => {
    if (value === null || value === undefined || value === "") return null;
    const number = typeof value === "number" ? value : Number(value.replace(",", "."));
    if (!Number.isFinite(number) || number < 0 || number > 999_999) {
      context.addIssue({ code: "custom", message: "Quantity must be a number, or left blank for TBC" });
      return z.NEVER;
    }
    return Math.round(number * 1000) / 1000;
  });

/** Adding a line: a material, and where it goes. */
export const lineSchema = z.object({
  materialId: z.string().min(1),
  room: text(80),
  qty,
  note: text(500),
});

/** Changing a line: anything left out stays as it is. */
export const lineChangeSchema = z.object({
  materialId: z.string().min(1).optional(),
  room: text(80).optional(),
  qty: qty.optional(),
  note: text(500).optional(),
});

export const jobSettingsSchema = z.object({
  showQty: z.boolean().optional(),
  roomPerPage: z.boolean().optional(),
  cover: z.boolean().optional(),
  title: text(120).optional(),
  coverFileId: z.string().min(1).nullish(),
  roomOrder: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
});

export const renameRoomSchema = z.object({
  from: z.string().trim().max(80),
  to: text(80),
});

export const companySettingsSchema = z.object({
  title: z.string().trim().min(1, "Give the schedule a title").max(120),
  /** Printed name per trade id; blank uses the trade's own name. */
  tradeNames: z.record(z.string(), z.string().trim().max(80)).default({}),
  /** Optional columns hidden per trade id. */
  tradeColumns: z.record(z.string(), z.array(z.enum(["link", "notes"]))).default({}),
});

export const shareSchema = z.object({
  days: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable().default(null),
});

export const emailSchema = z.object({
  to: z.email("Check the email address").max(200),
  message: z.string().trim().max(2000).optional(),
});

export type LineInput = z.infer<typeof lineSchema>;
export type LineChange = z.infer<typeof lineChangeSchema>;
export type JobSettingsInput = z.infer<typeof jobSettingsSchema>;
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
export type ShareInput = z.infer<typeof shareSchema>;
export type EmailInput = z.infer<typeof emailSchema>;

/** Bring in: the ticked changes ("add:<key>", "update:<id>", "remove:<id>"). */
export const bringInSchema = z.object({
  choices: z.array(z.string().min(1).max(300)).min(1).max(2000),
});
