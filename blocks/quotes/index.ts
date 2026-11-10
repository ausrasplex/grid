// Public API for blocks that depend on "quotes" (invoices, later).
export { getQuote, quoteForJob, type QuoteView, type QuoteSnapshot } from "./service";
export { calculate, formatMoney } from "./money";
