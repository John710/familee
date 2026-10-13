/**
 * Familee - the container liveness probe
 *
 * It only answers whether the process is up: the database is deliberately
 * not consulted here. Otherwise restarting postgres on the server would
 * make Docker kill a perfectly healthy application, and it would come
 * back only once the database was up again.
 */

export const dynamic = "force-dynamic";

export function GET() {
    return Response.json(
        { status: "ok", time: new Date().toISOString() },
        { headers: { "cache-control": "no-store" } },
    );
}
