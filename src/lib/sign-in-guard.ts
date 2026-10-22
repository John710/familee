/**
 * Familee - the sign-in attempts of one account
 *
 * Ten failed attempts within fifteen minutes stop the next ones until the window passes. Only a
 * failure counts, so a family that signs in and out all evening never locks itself out; a success
 * clears the counter.
 *
 * The identifier is the field the endpoint authenticates: /sign-in/username signs in by user name,
 * and an e-mail address in the same body is a decoy that must not move the counter to another key.
 */

export const SIGN_IN_ATTEMPTS = 10;
export const SIGN_IN_WINDOW_SECONDS = 15 * 60;

/** The endpoints whose attempts are counted. */
export function isSignInPath(path: string): boolean {
    return path === "/sign-in/email" || path === "/sign-in/username";
}

/** The identifier a sign-in request names, or null when it names none. */
export function signInIdentifier(path: string, body: unknown): string | null {
    if (typeof body !== "object" || body === null) return null;
    const { email, username } = body as { email?: unknown; username?: unknown };
    const value = path === "/sign-in/username" ? username : email;
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The Redis key of one account's failed attempts. */
export function signInAttemptsKey(identifier: string): string {
    return `familee:signin-attempts:${identifier.trim().toLowerCase()}`;
}

/** Whether an account may still try: the limit itself is the first refused attempt. */
export function signInAllowed(attempts: number): boolean {
    return attempts < SIGN_IN_ATTEMPTS;
}

/**
 * Whether the answer of a sign-in endpoint is a refusal. The endpoint returns an APIError (it
 * carries a status code) for a wrong password or an unknown account, and the session otherwise.
 */
export function signInFailed(returned: unknown): boolean {
    if (typeof returned !== "object" || returned === null) return false;
    const status = (returned as { statusCode?: unknown }).statusCode;
    return typeof status === "number" && status >= 400;
}
