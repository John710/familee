/**
 * Familee - the members of a tree
 *
 * Mirrors the "MEMBERS OF A TREE" block of db/migrations/0000_init.sql:
 * tree_members.
 *
 * A separate file rather than part of ./trees: the table references persons,
 * and inside trees.ts that would make a circular import trees <-> persons.
 *
 * self_person_id is the person the user themselves is. From it comes the
 * answer to "how is this person related to me": familee.kinship() from
 * 0001_functions.sql returns the common ancestor and two depths, and the
 * caption ("great-uncle") is composed by the app from messages/<locale>.json.
 */

import { index, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { familee, memberRoleEnum } from "./enums";
import { persons } from "./persons";
import { trees } from "./trees";

export const treeMembers = familee.table(
    "tree_members",
    {
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        /** The rights on this tree. The global role lives in users.role. */
        role: memberRoleEnum("role").notNull().default("viewer"),

        selfPersonId: uuid("self_person_id").references(() => persons.id, {
            onDelete: "set null",
        }),
        /** When the choice of self was made: the profile shows the most recent choice. */
        selfChosenAt: timestamp("self_chosen_at", { withTimezone: true, mode: "date" }),
        invitedBy: text("invited_by").references(() => users.id, {
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
        primaryKey({
            name: "tree_members_pkey",
            columns: [t.treeId, t.userId],
        }),
        index("tree_members_user_idx").on(t.userId),
        // One person can be chosen as self by one member of the tree only
        // (db/migrations/0010_self_person_unique.sql).
        uniqueIndex("tree_members_self_person_key").on(t.treeId, t.selfPersonId),
    ],
);

export type TreeMember = typeof treeMembers.$inferSelect;
export type NewTreeMember = typeof treeMembers.$inferInsert;
