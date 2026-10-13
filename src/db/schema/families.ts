/**
 * Familee - unions and parentage
 *
 * Mirrors the "UNIONS (families) AND PARENTAGE" block of 0000_init.sql:
 * families, family_partners, family_children.
 *
 * Parentage is described through a union rather than mother/father fields on a
 * person. Remarriages, same-sex couples, adopted children and single parents
 * all fit without hacks - and GEDCOM is built the same way (INDI + FAM).
 *
 * The composite foreign keys (tree_id, id) guarantee that a partner, a child
 * and a union all belong to one and the same tree.
 */

import { sql } from "drizzle-orm";
import {
    check,
    foreignKey,
    index,
    jsonb,
    primaryKey,
    smallint,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import {
    type ChildRelation,
    childRelationEnum,
    familee,
    familyStatusEnum,
    familyTypeEnum,
    partnerRoleEnum,
} from "./enums";
import { persons } from "./persons";
import { trees } from "./trees";

export const families = familee.table(
    "families",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),

        type: familyTypeEnum("type").notNull().default("marriage"),
        status: familyStatusEnum("status").notNull().default("unknown"),
        notes: text("notes"),
        gedcomXref: text("gedcom_xref"),

        createdBy: text("created_by").references(() => users.id, {
            onDelete: "set null",
        }),
        updatedBy: text("updated_by").references(() => users.id, {
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
        unique("families_tree_id_id_key").on(t.treeId, t.id),
        unique("families_gedcom_xref_key").on(t.treeId, t.gedcomXref),
        index("families_tree_id_idx").on(t.treeId),
    ],
);

/**
 * The partners of a union. Usually two, but one is allowed: the second parent
 * is unknown. The cycle "a person is both a partner and a child of one union"
 * is cut off by familee.family_partners_check() from 0001_functions.sql.
 */
export const familyPartners = familee.table(
    "family_partners",
    {
        treeId: uuid("tree_id").notNull(),
        familyId: uuid("family_id").notNull(),
        personId: uuid("person_id").notNull(),
        role: partnerRoleEnum("role").notNull().default("unknown"),
        sortOrder: smallint("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        primaryKey({
            name: "family_partners_pkey",
            columns: [t.familyId, t.personId],
        }),
        foreignKey({
            columns: [t.treeId, t.familyId],
            foreignColumns: [families.treeId, families.id],
            name: "family_partners_family_fk",
        }).onDelete("cascade"),
        foreignKey({
            columns: [t.treeId, t.personId],
            foreignColumns: [persons.treeId, persons.id],
            name: "family_partners_person_fk",
        }).onDelete("cascade"),
        index("family_partners_person_idx").on(t.personId),
        index("family_partners_tree_idx").on(t.treeId),
    ],
);

/**
 * The children of a union. relation_by_partner is needed when the relation
 * differs per parent: a child born to the mother and adopted by the father.
 * The format is {"<person_id of the partner>": "adopted"}.
 */
export const familyChildren = familee.table(
    "family_children",
    {
        treeId: uuid("tree_id").notNull(),
        familyId: uuid("family_id").notNull(),
        personId: uuid("person_id").notNull(),
        relation: childRelationEnum("relation").notNull().default("biological"),

        relationByPartner: jsonb("relation_by_partner")
            .$type<Record<string, ChildRelation>>()
            .notNull()
            .default({}),

        birthOrder: smallint("birth_order"),
        notes: text("notes"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        primaryKey({
            name: "family_children_pkey",
            columns: [t.familyId, t.personId],
        }),
        foreignKey({
            columns: [t.treeId, t.familyId],
            foreignColumns: [families.treeId, families.id],
            name: "family_children_family_fk",
        }).onDelete("cascade"),
        foreignKey({
            columns: [t.treeId, t.personId],
            foreignColumns: [persons.treeId, persons.id],
            name: "family_children_person_fk",
        }).onDelete("cascade"),
        check(
            "family_children_relation_by_partner_object",
            sql`jsonb_typeof(${t.relationByPartner}) = 'object'`,
        ),
        /**
         * Added in 0001_functions.sql: it checks that the keys are uuids and
         * the values are child_relation labels. The function is IMMUTABLE,
         * otherwise it could not be called in a CHECK.
         */
        check(
            "family_children_relation_by_partner_valid",
            sql`familee.is_child_relation_map(${t.relationByPartner})`,
        ),
        index("family_children_person_idx").on(t.personId),
        index("family_children_tree_idx").on(t.treeId),
    ],
);

export type Family = typeof families.$inferSelect;
export type NewFamily = typeof families.$inferInsert;
export type FamilyPartner = typeof familyPartners.$inferSelect;
export type NewFamilyPartner = typeof familyPartners.$inferInsert;
export type FamilyChild = typeof familyChildren.$inferSelect;
export type NewFamilyChild = typeof familyChildren.$inferInsert;
