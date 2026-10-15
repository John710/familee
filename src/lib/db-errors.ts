/**
 * Familee - the errors Postgres reports, told apart by their SQLSTATE
 *
 * postgres.js raises a constraint violation as a PostgresError carrying the SQLSTATE in `code`.
 * A unique violation is 23505; the callers turn it into a message for the person or into a retry,
 * never into an error page. The checks live here so every caller reads the driver the same way.
 */

/** SQLSTATE of a unique-constraint or unique-index violation. */
const UNIQUE_VIOLATION = "23505";

/** Whether the error is a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === UNIQUE_VIOLATION
    );
}
