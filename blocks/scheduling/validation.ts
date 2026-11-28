import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

/**
 * Booking or changing a visit: a day and a start time (the end defaults to
 * the business's visit length), or all day, over one or more days.
 */
export const visitSchema = z
  .object({
    day,
    startTime: time.optional(),
    endTime: time.optional(),
    isAllDay: z.boolean().default(false),
    /** All day over more than one day: the last day, included. */
    lastDay: day.optional(),
    isTentative: z.boolean().default(false),
    label: optionalText(60),
    notes: optionalText(2000),
    /** "Book anyway" after a clash, a busy day or time off. */
    isWarningAcknowledged: z.boolean().default(false),
  })
  .strict()
  .refine((input) => input.isAllDay || input.startTime, { message: "Pick a start time", path: ["startTime"] })
  .refine((input) => !input.isAllDay || !input.lastDay || input.lastDay >= input.day, { message: "The last day can't be before the first", path: ["lastDay"] })
  .refine((input) => input.isAllDay || !input.startTime || !input.endTime || input.endTime > input.startTime, { message: "Finish after it starts", path: ["endTime"] });
export type VisitInput = z.infer<typeof visitSchema>;

export const visitStatusSchema = z.object({ status: z.enum(["BOOKED", "DONE", "CANCELLED"]) }).strict();

export const agendaQuery = z.object({ from: day, to: day }).strict();

export const settingsSchema = z
  .object({
    defaultVisitLengthMinutes: z.coerce.number().int().min(15, "At least 15 minutes").max(24 * 60, "A day at most"),
    dayStartsAt: time,
    dayEndsAt: time,
  })
  .strict()
  .refine((input) => input.dayEndsAt > input.dayStartsAt, { message: "The day ends after it starts", path: ["dayEndsAt"] });
export type SettingsInput = z.infer<typeof settingsSchema>;

export const userSettingsSchema = z
  .object({
    /** Empty (null): no warning. */
    dailyVisitWarningLimit: z.coerce.number().int().min(1, "At least 1").max(50).nullable(),
  })
  .strict();
export type UserSettingsInput = z.infer<typeof userSettingsSchema>;
