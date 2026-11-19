import { z } from "zod";

const sheetName = z.string().min(1).max(200);
const rowKey = z.string().min(3).max(200);

export const entriesSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            // Made on the phone (crypto.randomUUID), so a resend is kept once.
            id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
            sheetName,
            rowKey,
            signedOff: z.boolean(),
            note: z.string().trim().max(500).nullable().optional(),
            rowText: z.string().max(200).default(""),
            at: z.iso.datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export type EntryInput = z.infer<typeof entriesSchema>["entries"][number];

export const matchSchema = z
  .object({
    sheetName,
    /** A header name, "" for the whole row, or null for Grid's guess. */
    matchColumn: z.string().trim().max(200).nullable(),
  })
  .strict();

export const clearSchema = z.object({ sheetName, rowKeys: z.array(rowKey).min(1).max(10_000) }).strict();
