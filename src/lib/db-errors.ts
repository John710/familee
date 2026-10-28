/**
 * Familee - the errors Postgres reports, told apart by their SQLSTATE
 *
 * postgres.js raises a constraint violation as a PostgresError carrying the SQLSTATE in `code`.
 * Drizzle wraps what the driver throws in a DrizzleQueryError and keeps the original in `cause`, so
 * the code is looked for along the chain of causes. A unique violation is 23505, a foreign-key
 * violation 23503, a check violation 23514 (the triggers raise the last two for a place inside
 * itself or from another tree); the callers turn them into a message for the person or into a retry,
 * never into an error page. The checks live here so every caller reads the driver the same way.
 */

/** SQLSTATE of a unique-constraint or unique-index violation. */
const UNIQUE_VIOLATION = "23505";
/** SQLSTATE of a foreign-key violation. */
const FOREIGN_KEY_VIOLATION = "23503";
/** SQLSTATE of a check-constraint violation. */
const CHECK_VIOLATION = "23514";

/** Whether the error, or something it was caused by, carries this SQLSTATE. */
function hasCode(error: unknown, code: string): boolean {
    let current: unknown = error;
    // The chain is short; the bound only guards against a cause that points back at itself.
    for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
        if ((current as { code?: unknown }).code === code) return true;
        current = (current as { cause?: unknown }).cause;
    }
    return false;
}

/**
 * The messages of the error and of its causes in one string, for the callers that tell a trigger's
 * exception apart by its text: the wrapper's own message is only "Failed query: ...", and the
 * sentence the trigger raised sits in the cause.
 */
export function errorText(error: unknown): string {
    const parts: string[] = [];
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
        parts.push(current instanceof Error ? current.message : String(current));
        current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
    }
    return parts.join("\n");
}

/** Whether the error is a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
    return hasCode(error, UNIQUE_VIOLATION);
}

/** Whether the error is a foreign-key violation. */
export function isForeignKeyViolation(error: unknown): boolean {
    return hasCode(error, FOREIGN_KEY_VIOLATION);
}

/** Whether the error is a check-constraint violation. */
export function isCheckViolation(error: unknown): boolean {
    return hasCode(error, CHECK_VIOLATION);
}
