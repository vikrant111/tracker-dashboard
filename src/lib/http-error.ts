/**
 * Its own module so the domain layer can throw one without importing the auth
 * stack, which would make `teams.ts` depend transitively on NextAuth.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
