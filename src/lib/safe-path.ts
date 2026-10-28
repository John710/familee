/**
 * Familee - return addresses after sign-in
 *
 * The sign-in page takes ?next=... to return the person to where they came from.
 * Only paths inside this site are allowed: anything with a scheme or a host
 * (https://…, //evil.example) would turn the sign-in into an open redirect.
 *
 * Browsers drop tabs and line breaks from a URL before they read it, so "/\t/evil.example"
 * becomes "//evil.example": a check of the characters alone is not enough. Control characters
 * and whitespace are refused outright, and what remains must resolve to this site's origin.
 */

const FALLBACK = "/trees";

/** A base no real host can have: a path that resolves anywhere else names a host of its own. */
const BASE = "http://x.invalid";

/** Whether the text holds an ASCII control character (DEL included) or any whitespace. */
function hasControlOrSpace(raw: string): boolean {
    for (const char of raw) {
        const code = char.codePointAt(0) ?? 0;
        if (code <= 0x20 || code === 0x7f) return true;
    }
    return /\s/u.test(raw);
}

export function safeNextPath(raw: string | undefined): string {
    if (!raw) return FALLBACK;
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return FALLBACK;
    if (hasControlOrSpace(raw)) return FALLBACK;

    try {
        if (new URL(raw, BASE).origin !== BASE) return FALLBACK;
    } catch {
        return FALLBACK;
    }
    return raw;
}
