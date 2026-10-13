/**
 * Familee - events and facts
 *
 * Mirrors the "EVENTS AND FACTS" block of db/migrations/0000_init.sql:
 * event_types, events.
 *
 * The catalogue of types is a table, not an enum: a user adds an event type of
 * their own without a migration. Captions come from messages/<locale>.json by
 * the key `events.<code>`; label_fallback applies only when there is none.
 *
 * An event belongs either to a person or to a union (events_subject_xor).
 * Dates are fuzzy: in genealogy an exact date is rather the exception.
 */

import { sql } from "drizzle-orm";
import {
    boolean,
    check,
    date,
    foreignKey,
    index,
    smallint,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import {
    calendarEnum,
    dateQualifierEnum,
    datePrecisionEnum,
    eventScopeEnum,
    familee,
} from "./enums";
import { families } from "./families";
import { persons } from "./persons";
import { places } from "./places";
import { trees } from "./trees";

/** Filled in by db/migrations/0002_reference_data.sql (with GEDCOM codes). */
export const eventTypes = familee.table(
    "event_types",
    {
        code: text("code").primaryKey(),
        appliesTo: eventScopeEnum("applies_to").notNull().default("person"),

        /** Carries a text value: an occupation, a rank, a document number. */
        hasValue: boolean("has_value").notNull().default(false),

        /** A key event of a life: birth, marriage, death. */
        isVital: boolean("is_vital").notNull().default(false),

        gedcomTag: text("gedcom_tag"),
        sortOrder: smallint("sort_order").notNull().default(100),

        /** true - the type was added by a user: the seed never overwrites it. */
        isCustom: boolean("is_custom").notNull().default(false),

        /** The caption to use when no connected language has a translation. */
        labelFallback: text("label_fallback"),

        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        check(
            "event_types_code_format",
            sql`${t.code} ~ '^[a-z][a-z0-9_]{0,48}$'`,
        ),
    ],
);

export const events = familee.table(
    "events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),

        typeCode: text("type_code")
            .notNull()
            .references(() => eventTypes.code, { onUpdate: "cascade" }),

        /** Exactly one of the two is filled - events_subject_xor checks that. */
        personId: uuid("person_id"),
        familyId: uuid("family_id"),

        placeId: uuid("place_id").references(() => places.id, {
            onDelete: "set null",
        }),

        /** The value of a fact: an occupation, a rank, a document number. */
        value: text("value"),
        description: text("description"),
        /** The age as the source puts it: "45 years", "a year and a half". */
        ageText: text("age_text"),

        dateQualifier: dateQualifierEnum("date_qualifier")
            .notNull()
            .default("exact"),
        datePrecision: datePrecisionEnum("date_precision").notNull().default("day"),
        calendar: calendarEnum("calendar").notNull().default("gregorian"),

        /** mode: "string" - 'YYYY-MM-DD', no time zones and no date shifts. */
        dateStart: date("date_start", { mode: "string" }),
        dateEnd: date("date_end", { mode: "string" }),
        /** As it was written in the source: "spring of 1912". */
        dateOriginal: text("date_original"),

        /** A single date instead of a range - for ordering by time. */
        sortDate: date("sort_date", { mode: "string" }).generatedAlwaysAs(
            sql`coalesce(date_start, date_end)`,
        ),

        /** The primary event of this type: one birth, one death. */
        isPrimary: boolean("is_primary").notNull().default(false),

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
        /** MATCH SIMPLE: when person_id is null the key check is skipped. */
        foreignKey({
            columns: [t.treeId, t.personId],
            foreignColumns: [persons.treeId, persons.id],
            name: "events_person_fk",
        }).onDelete("cascade"),
        foreignKey({
            columns: [t.treeId, t.familyId],
            foreignColumns: [families.treeId, families.id],
            name: "events_family_fk",
        }).onDelete("cascade"),

        check(
            "events_subject_xor",
            sql`(${t.personId} is not null)::int + (${t.familyId} is not null)::int = 1`,
        ),
        check(
            "events_date_order",
            sql`${t.dateStart} is null or ${t.dateEnd} is null or ${t.dateStart} <= ${t.dateEnd}`,
        ),
        check(
            "events_between_needs_range",
            sql`${t.dateQualifier} <> 'between' or (${t.dateStart} is not null and ${t.dateEnd} is not null)`,
        ),
        check(
            "events_from_to_needs_range",
            sql`${t.dateQualifier} <> 'from_to' or ${t.dateStart} is not null`,
        ),
        check(
            "events_unknown_has_no_date",
            sql`${t.dateQualifier} <> 'unknown' or (${t.dateStart} is null and ${t.dateEnd} is null)`,
        ),

        index("events_person_type_idx").on(t.personId, t.typeCode),
        index("events_family_type_idx").on(t.familyId, t.typeCode),
        index("events_tree_sort_date_idx").on(
            t.treeId,
            t.sortDate.asc().nullsLast(),
        ),
        index("events_place_idx").on(t.placeId),

        /** At most one primary event of each type. */
        uniqueIndex("events_person_primary_key")
            .on(t.personId, t.typeCode)
            .where(sql`is_primary and person_id is not null`),
        uniqueIndex("events_family_primary_key")
            .on(t.familyId, t.typeCode)
            .where(sql`is_primary and family_id is not null`),
    ],
);

export type EventType = typeof eventTypes.$inferSelect;
export type NewEventType = typeof eventTypes.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
