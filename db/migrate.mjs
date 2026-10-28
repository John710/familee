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

/** How often the first connection is tried, and how long to wait between two tries. */
const connectAttempts = 5;
const connectDelayMs = 2000;

/**
 * The first connection, tried a few times. The application and Postgres often start together (a
 * reboot of the host), and a refused connection would otherwise end the container, which then
 * restarts in a loop until Postgres is up. Anything that is still failing after the last try is
 * thrown as it is.
 */
async function connect(client) {
    for (let attempt = 1; ; attempt += 1) {
        try {
            await client`select 1`;
            return;
        } catch (error) {
            if (attempt >= connectAttempts) throw error;
            const reason = error instanceof Error ? error.message : String(error);
            console.error(
                `migrate: no connection yet (${reason}), try ${attempt} of ${connectAttempts}`,
            );
            await new Promise((resolve) => setTimeout(resolve, connectDelayMs));
        }
    }
}

/**
 * The details Postgres sends with an error, as far as there are any: the line of the file the
 * position points at is easier to find than an offset into it.
 */
function describe(error, text) {
    if (!(error instanceof Error)) return [String(error)];
    const lines = [error.message];
    if (error.detail) lines.push(`detail: ${error.detail}`);
    if (error.hint) lines.push(`hint: ${error.hint}`);
    if (error.where) lines.push(`where: ${error.where}`);
    if (error.position) {
        const offset = Number(error.position);
        const line =
            text && Number.isInteger(offset)
                ? `, line ${text.slice(0, offset - 1).split("\n").length}`
                : "";
        lines.push(`position: ${error.position}${line}`);
    }
    return lines;
}

const sql = postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => {},
});

let current = null;
let currentText = null;

try {
    await connect(sql);
    await sql`select pg_advisory_lock(${lockKey})`;

    const applied = await appliedVersions(sql);
    let count = 0;

    for (const file of files) {
        const version = file.slice(0, -".sql".length);
        if (applied.has(version)) continue;

        console.log(`-> ${file}`);
        current = file;
        currentText = readFileSync(path.join(migrationsDir, file), "utf8");
        /* .simple() sends the file as one simple query: a migration holds
           several statements and opens and closes its own transaction. */
        await sql.unsafe(currentText).simple();
        current = null;
        currentText = null;
        count += 1;
    }

    console.log(
        count === 0
            ? `migrate: the schema is up to date (${files.length} migrations)`
            : `migrate: applied ${count} migration(s)`,
    );
} catch (error) {
    console.error(`migrate: ${current ? `failed on ${current}` : "failed"}`);
    for (const line of describe(error, currentText)) console.error(line);
    process.exitCode = 1;
} finally {
    await sql.end({ timeout: 5 });
}
