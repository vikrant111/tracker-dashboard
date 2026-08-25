import { SESSION } from "./constants.ts";

/**
 * The flags on the session cookie.
 *
 * NextAuth's defaults are already these values — this states them anyway, for
 * two reasons. They are the difference between "an XSS bug is a bug" and "an
 * XSS bug is every account", so they should be visible in the source rather
 * than inherited from a library's changelog. And stated, they can be checked;
 * inherited, they cannot.
 *
 * | Flag | Stops |
 * |---|---|
 * | `httpOnly` | JavaScript reading the token at all — `document.cookie` cannot see it, so a script injected into the page cannot steal a session |
 * | `sameSite: "lax"` | the cookie riding along on a cross-site POST, which is what CSRF is |
 * | `secure` | the cookie ever crossing plain HTTP, where anything on the path can read it |
 * | `__Secure-` prefix | a non-HTTPS origin overwriting it — the browser refuses to set the name at all without `secure` |
 *
 * `lax` rather than `strict` on purpose: `strict` withholds the cookie on the
 * redirect back from Microsoft Entra, so SSO sign-in would land on the login
 * page in a loop. `lax` still refuses cross-site POSTs, which is the attack.
 */
export function authCookies(isProduction: boolean) {
  const prefix = isProduction ? "__Secure-" : "";

  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProduction,
  };

  return {
    sessionToken: {
      name: `${prefix}authjs.session-token`,
      options: { ...base, maxAge: SESSION.idleSeconds },
    },
    /*
     * The CSRF cookie is deliberately **not** httpOnly-exempt: NextAuth pairs a
     * cookie value with a form field and compares them, so the browser having
     * it is the point. `__Host-` rather than `__Secure-` because it is scoped
     * to this exact origin with no domain — the strictest prefix there is.
     */
    csrfToken: {
      name: isProduction ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
      options: base,
    },
    callbackUrl: {
      name: `${prefix}authjs.callback-url`,
      options: base,
    },
    /** Short-lived, and only alive during an OAuth round trip. */
    pkceCodeVerifier: {
      name: `${prefix}authjs.pkce.code_verifier`,
      options: { ...base, maxAge: 60 * 15 },
    },
    state: {
      name: `${prefix}authjs.state`,
      options: { ...base, maxAge: 60 * 15 },
    },
    nonce: {
      name: `${prefix}authjs.nonce`,
      options: base,
    },
  };
}
