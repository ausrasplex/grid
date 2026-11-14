import { z } from "zod";
import { INKS, MARKUP_KINDS } from "./geometry";

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
};

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
  })
  .strict()
  .superRefine((markup, issues) => {
    const [least, most] = POINTS[markup.kind];
    if (markup.points.length < least || markup.points.length > most) issues.addIssue({ code: "custom", path: ["points"], message: `A ${markup.kind.toLowerCase()} needs ${least === most ? least : `${least} to ${most}`} points` });
    if (markup.kind === "TEXT" && !markup.text) issues.addIssue({ code: "custom", path: ["text"], message: "Type some text" });
  });

export const updateMarkupSchema = z
  .object({
    points: z.array(point).min(1).max(5000),
    color: ink,
    size: z.number().positive().max(1),
    text: z.string().trim().min(1, "Type some text").max(2000),
    visibility,
  })
  .partial()
  .strict();

export const setScaleSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("RATIO"), ratio: z.number().int().min(1).max(100_000) }).strict(),
  z.object({ method: z.literal("POINTS"), points: z.tuple([point, point]), knownMetres: z.number().positive().max(100_000) }).strict(),
]);

export type CreateMarkupInput = z.infer<typeof createMarkupSchema>;
export type UpdateMarkupInput = z.infer<typeof updateMarkupSchema>;
export type SetScaleInput = z.infer<typeof setScaleSchema>;
