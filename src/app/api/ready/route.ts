/**
 * Familee - the readiness probe
 *
 * Unlike /api/health, which only says that the process is up, this one asks the
 * dependencies a request needs to be answered: Postgres and Redis. It is for an
 * external monitor. The container healthcheck stays liveness on purpose: if it
 * asked the database, restarting Postgres would make Docker kill a healthy
 * application (see src/app/api/health/route.ts).
 *
 * The body names each dependency and whether it answered, without the error
 * text, so the answer never leaks a connection string.
 */

import { client } from "@/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
    const [database, redisAnswers] = await Promise.all([
        reachable("the database", () => client`select 1`),
        reachable("redis", () => redis.ping()),
    ]);
    const ready = database && redisAnswers;

    return Response.json(
        {
            status: ready ? "ready" : "not-ready",
            checks: { database, redis: redisAnswers },
            time: new Date().toISOString(),
        },
        {
            status: ready ? 200 : 503,
            headers: { "cache-control": "no-store" },
        },
    );
}

/** Runs a check and turns a failure into a plain false, logging why on the server. */
async function reachable(what: string, run: () => Promise<unknown>): Promise<boolean> {
    try {
        await run();
        return true;
    } catch (error) {
        console.error(`ready: ${what} did not answer`, error);
        return false;
    }
}
