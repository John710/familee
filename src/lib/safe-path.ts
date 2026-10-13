/**
 * Familee - return addresses after sign-in
 *
 * The sign-in page takes ?next=... to return the person to where they came from.
 * Only paths inside this site are allowed: anything with a scheme or a host
 * (https://…, //evil.example) would turn the sign-in into an open redirect.
 */

const FALLBACK = "/trees";

export function safeNextPath(raw: string | undefined): string {
    if (!raw) return FALLBACK;
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return FALLBACK;
    return raw;
}
