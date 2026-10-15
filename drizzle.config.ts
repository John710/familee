/**
 * Familee - drizzle-kit configuration
 *
 * WARNING: the migrations in db/migrations are written by hand and are the
 * single source of truth. `drizzle-kit generate` must NOT be used: it knows
 * nothing about the triggers, functions, views and checks added in
 * 0001_functions.sql, and it would wipe them out with its own SQL.
 *
 * The allowed commands:
 *   drizzle-kit check   - verify that the migration files are consistent
 *   drizzle-kit up      - refresh the internal snapshot files
 *   drizzle-kit studio  - browse the data in a web UI
 *   drizzle-kit pull    - pull the schema out of the database (to compare)
 *
 * The migrations are applied by the image (db/migrate.mjs), never by drizzle-kit.
 */

import { defineConfig } from "drizzle-kit";

/** drizzle-kit reads .env from the project root; in Docker it is already set. */
const url = process.env.DATABASE_URL ?? "";

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/db/schema/index.ts",
    out: "./db/migrations",

    /** Never touch foreign schemas: the server keeps several apps in one database. */
    schemaFilter: ["familee"],

    /** camelCase in TypeScript -> snake_case in SQL. */
    casing: "snake_case",

    dbCredentials: { url },

    strict: true,
    verbose: true,
});
