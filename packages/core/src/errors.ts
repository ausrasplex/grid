// Errors a route handler can throw; the app turns them into HTTP responses.

const BRAND = Symbol.for("grid.HttpError");

export class HttpError extends Error {
  readonly [BRAND] = true;
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * True for any HttpError, even one made by a second copy of this module
 * (the bundler can load @grid/core more than once). Use this, not instanceof.
 */
export function isHttpError(error: unknown): error is HttpError {
  return typeof error === "object" && error !== null && (error as Record<symbol, unknown>)[BRAND] === true;
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in required") =>
  new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do that") =>
  new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
