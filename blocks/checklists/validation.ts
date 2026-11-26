import { z } from "zod";

export const addSchema = z.object({ text: z.string().trim().min(1, "Type something to add") }).strict();
export const renameSchema = z.object({ text: z.string().trim().min(1, "An item needs some words") }).strict();
export const tickSchema = z.object({ done: z.boolean() }).strict();
