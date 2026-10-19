/**
 * Familee - the version of this archive, and the newest release on GitHub
 *
 * The footer asks this whenever a page is opened, so the answer is kept in memory: GitHub itself is
 * asked at most once every six hours, and a check that failed - an archive on a home network often
 * has no way out at all - is tried again after ten minutes, so an instance that comes back online
 * learns about a release soon enough. The answer never carries an error: an archive without
 * internet simply has nothing to announce, and no page waits on GitHub.
 */

import { NextResponse } from "next/server";

import { APP_VERSION, isNewer, REPOSITORY, versionFromRelease } from "@/lib/app-version";

/** How long a good answer is kept, and how long a failed one. */
const GOOD_ANSWER_MS = 6 * 60 * 60 * 1000;
const FAILED_ANSWER_MS = 10 * 60 * 1000;

/** GitHub answers in a moment; a page of the archive must not wait on it. */
const TIMEOUT_MS = 4000;

/** The newest release seen so far, and when it was seen. */
let lastCheck: { at: number; latest: string | null } | null = null;

/** The version of the newest release on GitHub, or null when GitHub could not be reached. */
async function fetchLatestVersion(): Promise<string | null> {
    try {
        const answer = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
            headers: {
                accept: "application/vnd.github+json",
                /** GitHub refuses a request that names no client. */
                "user-agent": `familee/${APP_VERSION}`,
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: "no-store",
        });
        if (!answer.ok) return null;

        return versionFromRelease(await answer.json());
    } catch {
        /** No way out, a proxy in the middle, a rate limit: the archive goes on without the news. */
        return null;
    }
}

/** The application version must be read per request; nothing here may be cached at build time. */
export const dynamic = "force-dynamic";

export async function GET() {
    const now = Date.now();
    const age = lastCheck === null ? Number.POSITIVE_INFINITY : now - lastCheck.at;
    /** A failed check is kept for the shorter while, so the archive asks again soon enough. */
    const kept = lastCheck?.latest ? GOOD_ANSWER_MS : FAILED_ANSWER_MS;

    if (age > kept) {
        lastCheck = { at: now, latest: await fetchLatestVersion() };
    }

    const latest = lastCheck?.latest ?? null;

    return NextResponse.json({
        current: APP_VERSION,
        latest,
        updateAvailable: latest !== null && isNewer(latest, APP_VERSION),
    });
}
