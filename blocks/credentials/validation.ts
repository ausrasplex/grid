import { z } from "zod";
import { TICKET_TYPES } from "./types";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .nullable()
  .optional()
  .transform((value) => value || null);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);

export const ticketSchema = z
  .object({
    type: z.enum(TICKET_TYPES.map((type) => type.id) as [string, ...string[]]),
    name: z.string().trim().max(120).default(""),
    number: text(80),
    issuer: text(120),
    issuedOn: date,
    expiresOn: date,
    frontFileId: z.string().uuid().nullable().optional(),
    backFileId: z.string().uuid().nullable().optional(),
    notes: text(2000),
  })
  .strict()
  .refine((value) => value.type !== "other" || value.name, { message: "Say what the ticket is", path: ["name"] });

export type TicketInput = z.infer<typeof ticketSchema>;
