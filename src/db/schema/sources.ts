/**
 * Familee - sources and citations
 *
 * Mirrors the "SOURCES AND CITATIONS" block of db/migrations/0000_init.sql:
 * repositories, sources, citations.
 *
 * repositories is where a document is kept (an archive, a library, a home
 * folder), sources is the document itself, citations is the reference to a
 * source for one particular fact. One tree for all three: for citations the
 * single-tree rule is checked by the trg_citations_check trigger from
 * 0001_functions.sql, because a composite foreign key is impossible here.
 */

import { sql } from "drizzle-orm";
import { check, index, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { familee } from "./enums";
import { events } from "./events";
import { families } from "./families";
import { persons } from "./persons";
import { trees } from "./trees";

export const repositories = familee.table(
    "repositories",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        address: text("address"),
        website: text("website"),
        notes: text("notes"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [index("repositories_tree_idx").on(t.treeId)],
);

export const sources = familee.table(
    "sources",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),
        repositoryId: uuid("repository_id").references(() => repositories.id, {
            onDelete: "set null",
        }),
        title: text("title").notNull(),
        author: text("author"),
        publication: text("publication"),

        /** The archival call number: fond / inventory / file. */
        callNumber: text("call_number"),

        textExcerpt: text("text_excerpt"),
        url: text("url"),
        gedcomXref: text("gedcom_xref"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        unique("sources_gedcom_xref_key").on(t.treeId, t.gedcomXref),
        index("sources_tree_idx").on(t.treeId),
    ],
);

export const citations = familee.table(
    "citations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        sourceId: uuid("source_id")
            .notNull()
            .references(() => sources.id, { onDelete: "cascade" }),

        /** Exactly one of the three is filled - citations_target_xor. */
        personId: uuid("person_id").references(() => persons.id, {
            onDelete: "cascade",
        }),
        familyId: uuid("family_id").references(() => families.id, {
            onDelete: "cascade",
        }),
        eventId: uuid("event_id").references(() => events.id, {
            onDelete: "cascade",
        }),

        page: text("page"),

        /** GEDCOM QUAY: 0 is questionable, 3 is reliable. */
        quality: smallint("quality").notNull().default(2),

        dateOriginal: text("date_original"),
        textExcerpt: text("text_excerpt"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        check(
            "citations_target_xor",
            sql`(${t.personId} is not null)::int + (${t.familyId} is not null)::int + (${t.eventId} is not null)::int = 1`,
        ),
        check("citations_quality_range", sql`${t.quality} between 0 and 3`),
        index("citations_source_idx").on(t.sourceId),
        index("citations_person_idx").on(t.personId),
        index("citations_event_idx").on(t.eventId),
    ],
);

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Citation = typeof citations.$inferSelect;
export type NewCitation = typeof citations.$inferInsert;
