// Public API for blocks that depend on "documents" (signoffs, later).
export { getDocument, spreadsheetForBlock, type DocumentView } from "./service";
export type { AddedColumns, SheetData, SheetSummary } from "./sheets";
export { documentKind, KIND_LABEL, type DocumentKind } from "./kinds";
