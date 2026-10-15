/**
 * Familee - trees (projects) and the migration log
 *
 * Mirrors the "Log of applied migrations" and "TREES" blocks of
 * db/migrations/0000_init.sql.
 *
 * One installation keeps several independent trees: the father's line, the
 * mother's line, a friend's tree. tree_id is present in almost every table,
 * and the composite foreign keys forbid linking persons of different trees.
 *
 * tree_members lives in ./members so that this file does not depend on persons.
 */

import { sql } from "drizzle-orm";
import { check, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { familee } from "./enums";

/**
 * The log of applied migrations. It is written by hand as the last statement
 * of every file in db/migrations - drizzle-kit does not maintain it.
 */
export const schemaMigrations = familee.table("schema_migrations", {
    version: text("version").primaryKey(),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const trees = familee.table(
    "trees",
    {
        id: uuid("id").primaryKey().defaultRandom(),

        /** Part of the URL: /ru/tree/<slug>. */
        slug: text("slug").notNull(),
        title: text("title").notNull(),
        description: text("description"),

        /** The logo: a data URL of a 256 x 256 WebP image; null when the tree has none. */
        logoData: text("logo_data"),

        /** The default language of the tree when the user has none of their own. */
        defaultLocale: text("default_locale").notNull().default("ru"),

        /**
         * The secret of the calendar feed (/api/calendar/<token>): a calendar app on a phone has no
         * session. Replacing the value retires the old address.
         */
        calendarToken: uuid("calendar_token").notNull().defaultRandom(),

        createdBy: text("created_by").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        unique("trees_slug_key").on(t.slug),
        uniqueIndex("trees_calendar_token_key").on(t.calendarToken),
        check("trees_slug_format", sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{0,62}$'`),
    ],
);

export type SchemaMigration = typeof schemaMigrations.$inferSelect;
export type NewSchemaMigration = typeof schemaMigrations.$inferInsert;
export type Tree = typeof trees.$inferSelect;
export type NewTree = typeof trees.$inferInsert;
