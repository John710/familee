/**
 * Familee - the database connection
 *
 * Postgres already runs on the server: the application connects to it and
 * never brings up a database container of its own. The connection string
 * comes from DATABASE_URL, the schema is familee.
 *
 * The postgres.js driver: no native dependencies, so the Docker image stays
 * small and builds without build-essential.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Client = ReturnType<typeof postgres>;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        "DATABASE_URL is not set. Example: postgres://familee:password@postgres:5432/familee",
    );
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * In dev mode Next.js reloads the modules on every file change. Without
 * the cache in globalThis every rebuild would open a new pool and hit the
 * server's max_connections in no time.
 */
const globalForDb = globalThis as unknown as { famileeClient?: Client };

function createClient(url: string): Client {
    return postgres(url, {
        /**
         * The database is shared with other applications of the server, so the
         * pool is a modest one. The value comes from DATABASE_POOL_MAX.
         */
        max: Number(process.env.DATABASE_POOL_MAX ?? 10),
        idle_timeout: 30,
        connect_timeout: 10,

        /** NOTICE messages from the triggers have no place in the app logs. */
        onnotice: () => {},

        /**
         * Parsing dates and times is left to Drizzle: it replaces the
         * postgres.js parsers for date/time/timestamp itself, which is why
         * date arrives as a 'YYYY-MM-DD' string and timestamptz as a Date.
         */
    });
}

export const client: Client =
    globalForDb.famileeClient ?? createClient(connectionString);

if (!isProduction) {
    globalForDb.famileeClient = client;
}

export const db = drizzle(client, {
    schema,
    casing: "snake_case",
    logger: !isProduction,
});

export type Database = typeof db;

export { schema };
export * from "./schema";
