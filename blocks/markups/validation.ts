import { z } from "zod";
import { INKS, MARKUP_KINDS } from "./geometry";
import { ICON_OUTLINES, isCustomKey, isIconKey } from "./icons";
import { SVG_MAX_LENGTH } from "./svg";

/** A built-in icon, or one of the business's own (checked against the database when placed). */
const anyIconKey = (key: string) => isIconKey(key) || isCustomKey(key);

// Sheet units: x 0 → 1, y 0 → height/width. A little slack past the edges.
const coordinate = z.number().finite().min(-1).max(10);
const point = z.tuple([coordinate, coordinate]);
const ink = z.enum(Object.keys(INKS) as [keyof typeof INKS, ...(keyof typeof INKS)[]]);
const visibility = z.enum(["JUST_ME", "COMPANY", "SHARED"]);

/** How many points each kind needs (a freehand stroke can have lots). */
const POINTS: Record<(typeof MARKUP_KINDS)[number], [number, number]> = {
  PEN: [2, 5000],
  HIGHLIGHT: [2, 5000],
  TEXT: [1, 1],
  LINE: [2, 2],
  ARROW: [2, 2],
  RECT: [2, 2],
  ELLIPSE: [2, 2],
  CLOUD: [2, 2],
  LENGTH: [2, 500],
  AREA: [3, 500],
  ICON: [1, 1],
};
const iconNumber = z.number().int().min(1).max(99).nullable();

export const createMarkupSchema = z
  .object({
    id: z.uuid(),
    sheetId: z.uuid(),
    versionId: z.uuid(),
    kind: z.enum(MARKUP_KINDS),
    points: z.array(point).min(1).max(5000),
    color: ink,
    size: z.number().positive().max(1),
    text: z.string().trim().max(2000).nullable().optional(),
    visibility: visibility.default("COMPANY"),
    iconKey: z.string().max(80).nullable().optional(),
    iconNumber: iconNumber.optional(),
    /** The sheet layer it goes on (null = Default). */
    layerId: z.uuid().nullable().optional(),
  })
  .strict()
  .superRefine((markup, issues) => {
    const [least, most] = POINTS[markup.kind];
    if (markup.points.length < least || markup.points.length > most) issues.addIssue({ code: "custom", path: ["points"], message: `A ${markup.kind.toLowerCase()} needs ${least === most ? least : `${least} to ${most}`} points` });
    if (markup.kind === "TEXT" && !markup.text) issues.addIssue({ code: "custom", path: ["text"], message: "Type some text" });
    if (markup.kind === "ICON" && !(markup.iconKey && anyIconKey(markup.iconKey))) issues.addIssue({ code: "custom", path: ["iconKey"], message: "Pick an icon" });
  });

export const updateMarkupSchema = z
  .object({
    points: z.array(point).min(1).max(5000),
    color: ink,
    size: z.number().positive().max(1),
    text: z.string().trim().min(1, "Type some text").max(2000),
    visibility,
    iconNumber,
    /** Move it to another layer (null = Default). */
    layerId: z.uuid().nullable(),
  })
  .partial()
  .strict();

export const setScaleSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("RATIO"), ratio: z.number().int().min(1).max(100_000) }).strict(),
  z.object({ method: z.literal("POINTS"), points: z.tuple([point, point]), knownMetres: z.number().positive().max(100_000) }).strict(),
]);

/** A new number for an icon on a job ("+" on the number chips). */
export const addIconVersionSchema = z.object({ iconKey: z.string().max(80).refine(anyIconKey, "Pick an icon"), name: z.string().trim().max(40).nullable().optional() }).strict();
export const updateIconVersionSchema = z.object({ name: z.string().trim().max(40).nullable(), priceItemId: z.uuid().nullable() }).partial().strict();
/** The price book item an icon number becomes on a quote (from the quote's Take-off). */
export const linkItemSchema = z.object({ iconKey: z.string().max(80).refine(anyIconKey, "Pick an icon"), number: z.number().int().min(1).max(99), priceItemId: z.uuid().nullable() }).strict();
/** Switch placed icons to another number. */
export const renumberSchema = z.object({ ids: z.array(z.uuid()).min(1).max(2000), iconNumber }).strict();

/** Settings › Icons. */
export const customIconSchema = z
  .object({
    trade: z.string().max(40),
    name: z.string().trim().min(1, "Give it a name").max(60),
    words: z.array(z.string().max(40)).max(20).default([]),
    outline: z.enum(ICON_OUTLINES as [string, ...string[]]),
    label: z.string().trim().max(3, "Up to 3 letters or numbers").default(""),
    /** An SVG file's text: made safe on the server, never kept as sent. */
    svg: z.string().max(SVG_MAX_LENGTH, "That SVG is too big for an icon (over 200 KB)").nullable().optional(),
    tint: z.boolean().default(false),
    /** A built-in icon's key: this replaces its look. */
    replacesKey: z.string().max(80).refine(isIconKey, "That built-in icon isn't there").nullable().optional(),
  })
  .strict()
  .refine((icon) => !!icon.svg || icon.label.length > 0, { path: ["label"], message: "Up to 3 letters or numbers, or upload an SVG" });
export type CustomIconInput = z.infer<typeof customIconSchema>;

export type CreateMarkupInput = z.infer<typeof createMarkupSchema>;
export type UpdateMarkupInput = z.infer<typeof updateMarkupSchema>;
export type SetScaleInput = z.infer<typeof setScaleSchema>;
