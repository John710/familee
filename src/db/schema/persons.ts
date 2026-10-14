/**
 * Familee - persons and their names
 *
 * Mirrors the "PERSONS" block of db/migrations/0000_init.sql: persons, person_names.
 *
 * The full name lives in a separate table: a person may have several of them -
 * a maiden name and a married one, a Cyrillic and a Latin spelling, a monastic name.
 * The display and search_vector columns are computed by Postgres (generated
 * always as ... stored), which is why the insert types do not have them.
 */

import { sql } from "drizzle-orm";
import {
    boolean,
    check,
    index,
    integer,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { tsvector } from "./_custom";
import { users } from "./auth";
import { familee, nameTypeEnum, privacyLevelEnum, sexEnum } from "./enums";
import { trees } from "./trees";

export const persons = familee.table(
    "persons",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),

        sex: sexEnum("sex").notNull().default("unknown"),

        /**
         * null = derive it: a person is living unless a death event with a date
         * exists. An explicit value wins: see familee.derive_is_living() in
         * 0001_functions.sql.
         */
        isLiving: boolean("is_living"),

        privacy: privacyLevelEnum("privacy").notNull().default("members"),

        /** A short caption under the name on a card: "physician", "founder". */
        headline: text("headline"),
        notes: text("notes"),

        /** The id from a GEDCOM file: a repeated import makes no duplicates. */
        gedcomXref: text("gedcom_xref"),

        /** Manual ordering of the cards when the dates are unknown. */
        sortOrder: integer("sort_order"),

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
        /** The point of the composite foreign keys: links never cross trees. */
        unique("persons_tree_id_id_key").on(t.treeId, t.id),
        unique("persons_gedcom_xref_key").on(t.treeId, t.gedcomXref),
        index("persons_tree_id_idx").on(t.treeId),
        index("persons_tree_sort_idx").on(t.treeId, t.sortOrder.asc().nullsLast()),
    ],
);

export const personNames = familee.table(
    "person_names",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        personId: uuid("person_id")
            .notNull()
            .references(() => persons.id, { onDelete: "cascade" }),

        type: nameTypeEnum("type").notNull().default("birth"),
        isPrimary: boolean("is_primary").notNull().default(false),

        surname: text("surname"),
        given: text("given"),
        patronymic: text("patronymic"),

        /** A title or a rank: "princess", "doctor". */
        prefix: text("prefix"),
        /** "junior", "III". */
        suffix: text("suffix"),
        nickname: text("nickname"),
        /** The maiden surname when type = 'married'. */
        surnameAtBirth: text("surname_at_birth"),

        /**
         * The language of the record: it allows keeping the same person's name
         * in Cyrillic and in Latin script as two separate names.
         */
        locale: text("locale"),

        notes: text("notes"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),

        /**
         * "Surname Given Patronymic" as a single string. The expression repeats
         * the SQL word for word: concat_ws() is banned here, it is STABLE.
         */
        display: text("display").generatedAlwaysAs(
            sql`btrim(coalesce(nullif(btrim(surname), '') || ' ', '') || coalesce(nullif(btrim(given), '') || ' ', '') || coalesce(nullif(btrim(patronymic), '') || ' ', '') || coalesce(nullif(btrim(suffix), ''), ''))`,
        ),

        /**
         * Search. The 'simple' configuration, not 'russian': stemming mangles
         * non-Russian names, and surnames do not need to be reduced to a stem.
         * The two-argument to_tsvector is IMMUTABLE - the one-argument one is not.
         */
        searchVector: tsvector("search_vector").generatedAlwaysAs(
            sql`to_tsvector('simple', coalesce(surname, '') || ' ' || coalesce(given, '') || ' ' || coalesce(patronymic, '') || ' ' || coalesce(nickname, '') || ' ' || coalesce(surname_at_birth, ''))`,
        ),
    },
    (t) => [
        check(
            "person_names_not_empty",
            sql`coalesce(btrim(${t.surname}), '') <> '' or coalesce(btrim(${t.given}), '') <> '' or coalesce(btrim(${t.nickname}), '') <> ''`,
        ),
        check(
            "person_names_locale_format",
            sql`${t.locale} is null or ${t.locale} ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'`,
        ),
        index("person_names_person_id_idx").on(t.personId),

        /** Exactly one primary name per person. */
        uniqueIndex("person_names_primary_key").on(t.personId).where(sql`is_primary`),

        index("person_names_search_idx").using("gin", t.searchVector),

        /** Search that survives typos: "Ivannov" still finds "Ivanov". */
        index("person_names_surname_trgm_idx").using("gin", t.surname.op("gin_trgm_ops")),
        index("person_names_display_trgm_idx").using("gin", t.display.op("gin_trgm_ops")),
    ],
);

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
export type PersonName = typeof personNames.$inferSelect;
export type NewPersonName = typeof personNames.$inferInsert;
