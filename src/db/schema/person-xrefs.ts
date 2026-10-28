/**
 * Familee - the further GEDCOM identifiers of a person
 *
 * Mirrors the person_xrefs block of db/migrations/0013_person_xrefs_and_merge.sql.
 *
 * A person carries the identifier of the record he came from in persons.gedcom_xref.
 * When two records of the same person are merged, the identifier of the one that goes
 * lands here, so a repeated import of the same file finds the survivor instead of
 * creating the duplicate again.
 */

import { foreignKey, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { familee } from "./enums";
import { persons } from "./persons";
import { trees } from "./trees";

export const personXrefs = familee.table(
    "person_xrefs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),
        personId: uuid("person_id").notNull(),

        /** As it stands in the file: "@I17@". */
        xref: text("xref").notNull(),

        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        /**
         * The point of the composite foreign key: identifiers never cross trees. The SQL leaves it
         * unnamed, so the name is the one Postgres chooses.
         */
        foreignKey({
            name: "person_xrefs_tree_id_person_id_fkey",
            columns: [t.treeId, t.personId],
            foreignColumns: [persons.treeId, persons.id],
        }).onDelete("cascade"),

        uniqueIndex("person_xrefs_tree_xref_key").on(t.treeId, t.xref),
        index("person_xrefs_person_idx").on(t.personId),
    ],
);

export type PersonXref = typeof personXrefs.$inferSelect;
export type NewPersonXref = typeof personXrefs.$inferInsert;
