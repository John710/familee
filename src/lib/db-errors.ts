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
        const message = (current as { message?: unknown }).message;
        parts.push(typeof message === "string" ? message : String(current));
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

/**
 * The translation key for what the pedigree triggers raise (a person made their own ancestor, a
 * second row for the same partner, a link across two trees), or null when the error is another
 * one. The triggers raise plain exceptions, so the sentence in the text is what tells them apart.
 */
export function pedigreeErrorKey(
    error: unknown,
): "errors.cycle" | "errors.duplicatePartner" | "errors.crossTree" | null {
    const text = errorText(error);
    if (text.includes("own ancestor") || text.includes("pedigree cycle")) return "errors.cycle";
    if (text.includes("already a partner")) return "errors.duplicatePartner";
    if (text.includes("belongs to another tree")) return "errors.crossTree";
    return null;
}

/**
 * The translation key for what familee.merge_persons(), merge_places() and merge_sources() raise:
 * the markers `merge_self` and `merge_not_found`, and for a person also what the pedigree
 * triggers say while the unions move over to the survivor.
 */
export function mergeErrorKey(error: unknown, kind: "person" | "place" | "source"): string {
    const text = errorText(error);
    if (text.includes("merge_self")) {
        return kind === "person" ? "duplicates.samePerson" : "duplicates.sameRecord";
    }
    if (text.includes("merge_not_found")) {
        return kind === "person" ? "duplicates.notFound" : `${kind}.notFound`;
    }
    if (kind === "person") {
        const pedigree = pedigreeErrorKey(error);
        // A union across two trees cannot come out of a merge inside one tree.
        if (pedigree === "errors.cycle" || pedigree === "errors.duplicatePartner") return pedigree;
    }
    return "errors.generic";
}
