/**
 * Familee - places
 *
 * Mirrors the "PLACES" block of db/migrations/0000_init.sql.
 *
 * Places form a hierarchy: Russia -> Tula Oblast -> Tula -> a street.
 * full_name ("Tula, Tula Oblast, Russia") is a cache recomputed by the
 * trg_places_before_write / trg_places_after_write triggers from
 * 0001_functions.sql, so there is no need to write it by hand.
 */

import { sql } from "drizzle-orm";
import {
    check,
    index,
    numeric,
    text,
    timestamp,
    uuid,
    type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { familee, placeKindEnum } from "./enums";
import { trees } from "./trees";

export const places = familee.table(
    "places",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),

        /** A self-reference: the type annotation is explicit, or TS recurses. */
        parentId: uuid("parent_id").references((): AnyPgColumn => places.id, {
            onDelete: "set null",
        }),

        name: text("name").notNull(),
        kind: placeKindEnum("kind").notNull().default("other"),

        /** The full name with the hierarchy. Written by the trigger, not the app. */
        fullName: text("full_name"),

        latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
        longitude: numeric("longitude", {
            precision: 9,
            scale: 6,
            mode: "number",
        }),

        /** Historical names: Saint Petersburg / Petrograd / Leningrad. */
        formerNames: text("former_names")
            .array()
            .notNull()
            .default(sql`'{}'::text[]`),

        notes: text("notes"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        check(
            "places_no_self_parent",
            sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`,
        ),
        check("places_name_not_empty", sql`btrim(${t.name}) <> ''`),
        check(
            "places_lat_range",
            sql`${t.latitude} is null or ${t.latitude} between -90 and 90`,
        ),
        check(
            "places_lon_range",
            sql`${t.longitude} is null or ${t.longitude} between -180 and 180`,
        ),
        index("places_tree_id_idx").on(t.treeId),
        index("places_parent_id_idx").on(t.parentId),
        index("places_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
    ],
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
