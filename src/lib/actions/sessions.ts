"use server";

/**
 * Familee - ending sessions of the signed-in person
 *
 * The list of sessions is read on the profile page; here a session is ended by its id
 * (never by its token, which stays on the server). better-auth removes the session from
 * Postgres and from the Redis cache, so the ended device is signed out at once.
 */

import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export type SessionResult = { ok: true } | { ok: false; error: string };

export async function revokeSessionAction(input: { sessionId: string }): Promise<SessionResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const [row] = await db
        .select({ token: schema.sessions.token })
        .from(schema.sessions)
        .where(
            and(
                eq(schema.sessions.id, input.sessionId),
                eq(schema.sessions.userId, user.id),
                gt(schema.sessions.expiresAt, new Date()),
            ),
        )
        .limit(1);
    if (!row) return { ok: false, error: "profile.sessionNotFound" };

    const result = await auth.api.revokeSession({
        headers: await headers(),
        body: { token: row.token },
    });
    if (!result.status) return { ok: false, error: "profile.sessionNotFound" };

    return { ok: true };
}

export async function revokeOtherSessionsAction(): Promise<SessionResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    await auth.api.revokeOtherSessions({ headers: await headers() });
    return { ok: true };
}
