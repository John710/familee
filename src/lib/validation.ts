/**
 * Familee - checks of user input on the server
 *
 * Every function returns either the cleaned value or a translation key naming the
 * problem. The keys live in messages/*.json, so the interface shows the message
 * in the person's language and the server never sends English prose to the browser.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The address in lower case, or null when it does not look like an address. */
export function normalizeEmail(raw: string): string | null {
    const email = raw.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
    return email;
}

/** The cleaned name, or null when it is empty or too long. */
export function validateName(raw: string): string | null {
    const name = raw.trim();
    if (name.length === 0 || name.length > 200) return null;
    return name;
}

/** null when the password is acceptable; otherwise the key of the problem. */
export function validatePassword(raw: string): string | null {
    if (raw.length < PASSWORD_MIN) return "auth.passwordTooShort";
    if (raw.length > PASSWORD_MAX) return "auth.passwordTooLong";
    return null;
}

/** The slug of a tree (part of the address), or null when it breaks the format. */
export function validateSlug(raw: string): string | null {
    const slug = raw.trim().toLowerCase();
    return SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * The slug of the demo tree. db/seed.sql deletes the tree with this slug and creates it anew, so
 * a tree of a person's own under it would be wiped by the next "create the demo tree".
 */
export const DEMO_SLUG = "demo";

/** Whether a (validated) slug is kept for the archive itself and cannot name a person's tree. */
export function isReservedSlug(slug: string): boolean {
    return slug === DEMO_SLUG;
}
