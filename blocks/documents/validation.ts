import { z } from "zod";

const uuid = z.uuid();
const name = (message: string) => z.string().trim().min(1, message).max(60);
const words = z.array(z.string().trim().min(1).max(60)).max(50);

export const addDocumentsSchema = z
  .object({
    fileIds: z.array(uuid).min(1).max(100),
    /** Where they go: a library, or a job (and optionally one of its folders). */
    libraryId: uuid.nullable().default(null),
    projectId: uuid.nullable().default(null),
    folderId: uuid.nullable().default(null),
    /** Add files even when the same file is already there. */
    allowDuplicates: z.boolean().default(false),
  })
  .strict()
  .refine((input) => !!input.libraryId !== !!input.projectId, "Pick a library or a job");

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(160),
    description: z.string().trim().max(2000),
    manufacturer: z.string().trim().max(80),
    models: words,
    productType: z.string().trim().max(80),
    tags: words,
    libraryId: uuid,
    folderId: uuid.nullable(),
    allowDownload: z.boolean(),
    availableOffline: z.boolean(),
  })
  .partial()
  .strict();

export const newVersionSchema = z.object({ fileId: uuid, note: z.string().trim().max(500).nullable().default(null) }).strict();
export const currentSchema = z.object({ versionId: uuid }).strict();
export const versionNoteSchema = z.object({ note: z.string().trim().max(500).nullable() }).strict();

export const librarySchema = z
  .object({
    name: name("Give the library a name"),
    isFinancial: z.boolean().default(false),
    allowDownload: z.boolean().default(true),
    availableOffline: z.boolean().default(false),
  })
  .strict();

export const folderSchema = z.object({ name: name("Give the folder a name") }).strict();
export const settingsSchema = z.object({ jobFolders: z.array(z.string().trim().min(1).max(60)).max(30) }).strict();
export const linkSchema = z.object({ projectId: uuid, folderId: uuid.nullable().default(null) }).strict();
export const linkFolderSchema = z.object({ folderId: uuid.nullable() }).strict();
export const deleteNowSchema = z.object({ ids: z.array(uuid).min(1).max(500) }).strict();

export type AddDocumentsInput = z.infer<typeof addDocumentsSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type LibraryInput = z.infer<typeof librarySchema>;

/** A sheet's header row for one version: a shown row index (0 = the first row). */
export const headerRowSchema = z.object({ headerRow: z.number().int().min(0) }).strict();
