// What kind of file a document is, and how the viewer shows it. Shared by
// the server and the screens (no server code here).

export type DocumentKind = "pdf" | "image" | "word" | "spreadsheet" | "slides" | "text" | "other";

const BY_MIME: Record<string, DocumentKind> = {
  "application/pdf": "pdf",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.oasis.opendocument.text": "word",
  "application/vnd.ms-excel": "spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet": "spreadsheet",
  "text/csv": "spreadsheet",
  "application/vnd.ms-powerpoint": "slides",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "slides",
  "application/vnd.oasis.opendocument.presentation": "slides",
  "text/plain": "text",
};

export function documentKind(mime: string): DocumentKind {
  if (mime.startsWith("image/")) return "image";
  return BY_MIME[mime] ?? "other";
}

/** Shown beside a document: "PDF", "Excel"… */
export const KIND_LABEL: Record<DocumentKind, string> = {
  pdf: "PDF",
  image: "Photo",
  word: "Word",
  spreadsheet: "Spreadsheet",
  slides: "Slides",
  text: "Text",
  other: "File",
};

/** "RT-200_Install_Guide_v3.pdf" → "RT-200 Install Guide v3". */
export function titleFromFileName(name: string | null | undefined): string {
  const base = (name ?? "").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (base || "Document").slice(0, 160);
}

/** What the file picker accepts. */
export const UPLOAD_ACCEPT = ".pdf,image/jpeg,image/png,image/webp,.doc,.docx,.odt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.txt";
