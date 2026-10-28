/**
 * Familee - the sign-in attempts of one account
 *
 * Ten failed attempts within fifteen minutes stop the next ones until the window passes. Only a
 * failure stays counted, so a family that signs in and out all evening never locks itself out; a
 * success clears the counter.
 *
 * Every attempt reserves its place before the password is checked (one atomic increment), and
 * the attempt that takes the counter past the limit is refused. Reading the counter first and
 * counting the failure afterwards let any number of parallel requests pass the same check.
 *
 * The identifier is the field the endpoint authenticates: /sign-in/username signs in by user name,
 * and an e-mail address in the same body is a decoy that must not move the counter to another key.
 * A user name of a known account is counted under that account's e-mail address, so the two
 * endpoints share one counter and cannot be used to double the limit.
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

/**
 * The name the attempts are counted under: the e-mail address of the account the identifier
 * belongs to, or the identifier itself when no account has it (an unknown name still counts,
 * under its own key).
 */
export function signInCounterName(identifier: string, accountEmail: string | null): string {
    return accountEmail ?? identifier;
}

/** The Redis key of one account's attempts. */
export function signInAttemptsKey(name: string): string {
    return `familee:signin-attempts:${name.trim().toLowerCase()}`;
}

/**
 * Whether an attempt may go on, given the counter its own reservation produced: the first ten
 * reservations in a window pass, the eleventh is refused.
 */
export function signInAllowed(reserved: number): boolean {
    return reserved <= SIGN_IN_ATTEMPTS;
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
