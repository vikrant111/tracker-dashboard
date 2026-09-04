/**
 * When an admin may set a local password on somebody else's account.
 *
 * An account with no password hash is one of two things, and they look
 * identical in storage: an SSO account whose password lives with the identity
 * provider, or an account somebody created with the field left blank, which
 * cannot sign in at all.
 *
 * Refusing both was safe and wrong. It left a mistyped account unrecoverable:
 * no password, no way to add one, and the only way out was deleting the person
 * and losing their role and PODs with them.
 *
 * What separates the two is whether SSO is configured. With it off, a blank
 * password cannot be an SSO account, so setting one is plainly right. With it
 * on the original reasoning holds: a local password on an SSO account is a
 * second way in that outlives the provider disabling them.
 *
 * Pure, so the rule is checked directly rather than by standing up an identity
 * provider.
 */

export type PasswordSubject = {
  /** Whether the account already has a local password. */
  hasPassword: boolean;
  /** Whether single sign-on is configured on this instance at all. */
  ssoEnabled: boolean;
};

/**
 * `null` when the admin may proceed, otherwise the sentence explaining why not.
 */
export function refuseLocalPassword({ hasPassword, ssoEnabled }: PasswordSubject, email: string): string | null {
  /* Already has one: this is an ordinary reset, always allowed. */
  if (hasPassword) return null;

  /* No SSO on this instance, so a blank password is a gap, not a design. */
  if (!ssoEnabled) return null;

  return (
    `${email} has no local password, and this instance uses single sign-on. ` +
    `If they sign in with SSO their password is managed by the identity provider, not here — ` +
    `giving them a local one would create a second way in that outlives their SSO account.`
  );
}

/**
 * What the button says. "Reset" and "Set" are different promises, and an admin
 * looking at somebody who cannot sign in needs to be offered the second.
 */
export const passwordActionLabel = (hasPassword: boolean): string =>
  hasPassword ? "Reset password" : "Set a password";
