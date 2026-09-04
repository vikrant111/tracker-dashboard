/**
 * Is that an email address?
 *
 * Its own module because both form validators need it, and the POD rules and
 * the account rules live in separate files — importing it from either would
 * make them import each other.
 *
 * Deliberately loose. The full grammar for a valid address is notoriously
 * baroque, and a strict pattern's failure mode is rejecting somebody's real
 * address, which is worse than accepting a typo the server will reject anyway.
 * Something, an `@`, something, a dot, something.
 */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: unknown): boolean => EMAIL.test(String(value ?? "").trim());
