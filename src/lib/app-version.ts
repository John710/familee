/**
 * Familee - the version of this archive, and the release it is missing
 *
 * The number is package.json's, read at build time and handed to the application by next.config.ts
 * as FAMILEE_VERSION - the same number the image carries in its tag, so the footer and the update
 * check cannot drift away from the release they belong to. Everything here is pure: the unit tests
 * in tests/app-version.test.ts pin how a tag is read and when a release counts as newer.
 */

/** The version of this build (next.config.ts, read from package.json at build time). */
export const APP_VERSION: string = process.env.FAMILEE_VERSION || "0.0.0";

/** The project the releases come from. A fork changes this line and its own name follows. */
export const REPOSITORY = "John710/familee";

export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

/** The page of the newest release, which GitHub keeps at this address. */
export const LATEST_RELEASE_URL = `${REPOSITORY_URL}/releases/latest`;

/**
 * The numbers of a version: "0.5.1" and "v0.5.1" both read as [0, 5, 1]. A tag that is not a plain
 * version - "nightly", "0.6.0-rc.1" - is null, and the caller decides what that means.
 */
export function parseVersion(text: string | null | undefined): number[] | null {
    if (typeof text !== "string") return null;

    const tag = text.trim().replace(/^v/i, "");
    if (!/^\d+(\.\d+)*$/.test(tag)) return null;

    return tag.split(".").map(Number);
}

/**
 * Which of two versions is the later one: a negative number, zero or a positive one, as a
 * comparison answers - or null when either side is not a version at all. The parts are compared as
 * numbers, so 0.10.0 is newer than 0.9.9, and a version that stops early counts as zero-padded
 * ("0.6" is the same as "0.6.0").
 */
export function compareVersions(left: string, right: string): number | null {
    const mine = parseVersion(left);
    const theirs = parseVersion(right);
    if (!mine || !theirs) return null;

    const length = Math.max(mine.length, theirs.length);
    for (let part = 0; part < length; part += 1) {
        const a = mine[part] ?? 0;
        const b = theirs[part] ?? 0;
        if (a !== b) return a < b ? -1 : 1;
    }

    return 0;
}

/**
 * Whether a release is newer than this build. A tag nobody can read is never an update: the footer
 * would rather say nothing than send the reader after a release that does not exist.
 */
export function isNewer(candidate: string, current: string = APP_VERSION): boolean {
    const order = compareVersions(candidate, current);
    return order !== null && order > 0;
}

/** The version a GitHub release carries in its tag, or null when the answer is not one. */
export function versionFromRelease(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;

    const tag = (payload as { tag_name?: unknown }).tag_name;
    if (typeof tag !== "string") return null;

    const version = tag.trim().replace(/^v/i, "");
    return parseVersion(version) ? version : null;
}
