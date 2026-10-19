/**
 * Familee - the liveness probe
 *
 * It only answers whether the process is up: the database is deliberately
 * not consulted here, so a caller that only wants to know the process is
 * alive is not sent into a restart loop by a database that is briefly gone.
 * A caller that needs to know whether Postgres and Redis answer uses
 * /api/ready instead - and that is the endpoint the container healthcheck
 * runs (docker-compose.build.yml).
 */

export const dynamic = "force-dynamic";

export function GET() {
    return Response.json(
        { status: "ok", time: new Date().toISOString() },
        { headers: { "cache-control": "no-store" } },
    );
}
