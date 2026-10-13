/**
 * Familee - custom column types
 *
 * Drizzle has no built-in tsvector, but the column
 * familee.person_names.search_vector is declared in 0000_init.sql as
 * `tsvector generated always as (...) stored`. To keep the schema equal to
 * the database (and to stop `drizzle-kit check` from calling the column
 * superfluous), the type is described here by hand.
 */

import { customType } from "drizzle-orm/pg-core";

/**
 * tsvector is read-only: the value is computed by Postgres.
 * In queries it is used through the @@ / ts_rank operators inside sql``.
 */
export const tsvector = customType<{
    data: string;
    driverData: string;
    notNull: false;
    default: false;
}>({
    dataType() {
        return "tsvector";
    },
});

/**
 * citext is not used: case-insensitive search is done with pg_trgm and
 * to_tsvector('simple', ...), just as in 0000_init.sql.
 */
