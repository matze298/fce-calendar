/**
 * The message from a caught value. A `throw` can carry anything, so the narrowing is
 * not optional, and `String(error)` is the honest fallback for the rest.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
