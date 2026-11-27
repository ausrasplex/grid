import { z } from "zod";
import { toOptionalAddress } from "@grid/core";

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => (value ? value : null));

export const themeSchema = z
  .object({
    logoFileId: z.string().uuid().nullable(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
    phone: optionalText(40),
    email: optionalText(200),
    /** In parts ({ street, suburb, state, postcode… }), or one line that's split up. Empty clears it. */
    address: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().transform(toOptionalAddress),
    website: optionalText(200),
    licenceLabel: optionalText(40),
    licenceNumber: optionalText(60),
    footerText: optionalText(500),
  })
  .strict();

export type ThemeInput = z.infer<typeof themeSchema>;
