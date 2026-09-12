/**
 * An error that already knows its HTTP status.
 *
 * Its own module so the domain layer can throw one without importing the auth
 * stack, which would make `teams.ts` depend transitively on NextAuth.
 *
 * `status` is assigned in the body rather than declared as a constructor
 * parameter property. Node's type stripping — what runs the check suite and
 * every script — cannot handle a parameter property, so the shorter spelling
 * made this module, and everything that imports it, unloadable by the checks.
 * That cost two pure helpers a detour before it was worth fixing properly.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
