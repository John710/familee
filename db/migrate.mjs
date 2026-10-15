#!/usr/bin/env node
/**
 * Familee - applying the migrations from inside the application image
 *
 * The container runs this before the server (see docker-entrypoint.sh), so the
 * schema always matches the image: a deploy is `docker compose pull` and then
 * `up -d`, with no separate migration step to remember.
 *
 * The files in db/migrations are idempotent and record themselves in
 * familee.schema_migrations, so only the versions that are not there yet are
 * applied. An advisory lock keeps two instances that start at once from racing.
 *
 * db/tools.sh (psql) stays for the tools profile: it can also load the demo
 * seed and run the smoke tests, which are written for psql.
 *
 * By hand:
 *   DATABASE_URL=postgres://... node db/migrate.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Any number works, as long as every instance of the application uses it. */
const lockKey = 4257013009;

const url = process.env.DATABASE_URL;
if (!url) {
    console.error("migrate: DATABASE_URL is not set");
    process.exit(1);
}

const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

if (files.length === 0) {
    console.error(`migrate: no .sql files in ${migrationsDir}`);
    process.exit(1);
}

/** The versions already recorded in familee.schema_migrations, if the table is there. */
async function appliedVersions(client) {
    const [table] = await client`
        select to_regclass('familee.schema_migrations') is not null as present
    `;
    if (!table.present) return new Set();

    const rows = await client`select version from familee.schema_migrations`;
    return new Set(rows.map((row) => row.version));
}

const sql = postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => {},
});

let current = null;

try {
    await sql`select pg_advisory_lock(${lockKey})`;

    const applied = await appliedVersions(sql);
    let count = 0;

    for (const file of files) {
        const version = file.slice(0, -".sql".length);
        if (applied.has(version)) continue;

        console.log(`-> ${file}`);
        current = file;
        /* .simple() sends the file as one simple query: a migration holds
           several statements and opens and closes its own transaction. */
        await sql.unsafe(readFileSync(path.join(migrationsDir, file), "utf8")).simple();
        current = null;
        count += 1;
    }

    console.log(
        count === 0
            ? `migrate: the schema is up to date (${files.length} migrations)`
            : `migrate: applied ${count} migration(s)`,
    );
} catch (error) {
    console.error(`migrate: ${current ? `failed on ${current}` : "failed"}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
} finally {
    await sql.end({ timeout: 5 });
}
