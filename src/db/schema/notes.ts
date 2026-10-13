/**
 * Familee - notes
 *
 * Mirrors the "NOTES" block of db/migrations/0000_init.sql.
 *
 * A note is attached either to exactly one entity or to none at all - and
 * then it is a standalone record of the researcher (a search diary).
 */

import { sql } from "drizzle-orm";
import { check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { familee } from "./enums";
import { events } from "./events";
import { families } from "./families";
import { media } from "./media";
import { persons } from "./persons";
import { places } from "./places";
import { sources } from "./sources";
import { trees } from "./trees";

export const notes = familee.table(
    "notes",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),
        title: text("title"),
        body: text("body").notNull(),

        /** At most one target - notes_target_at_most_one. */
        personId: uuid("person_id").references(() => persons.id, {
            onDelete: "cascade",
        }),
        familyId: uuid("family_id").references(() => families.id, {
            onDelete: "cascade",
        }),
        eventId: uuid("event_id").references(() => events.id, {
            onDelete: "cascade",
        }),
        placeId: uuid("place_id").references(() => places.id, {
            onDelete: "cascade",
        }),
        sourceId: uuid("source_id").references(() => sources.id, {
            onDelete: "cascade",
        }),
        mediaId: uuid("media_id").references(() => media.id, {
            onDelete: "cascade",
        }),

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
        check("notes_body_not_empty", sql`btrim(${t.body}) <> ''`),
        check(
            "notes_target_at_most_one",
            sql`(${t.personId} is not null)::int + (${t.familyId} is not null)::int + (${t.eventId} is not null)::int + (${t.placeId} is not null)::int + (${t.sourceId} is not null)::int + (${t.mediaId} is not null)::int <= 1`,
        ),
        index("notes_tree_idx").on(t.treeId, t.createdAt.desc()),
        index("notes_person_idx").on(t.personId),
    ],
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
