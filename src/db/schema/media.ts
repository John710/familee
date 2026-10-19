/**
 * Familee - media files
 *
 * Mirrors the "MEDIA" block of db/migrations/0000_init.sql:
 * media, media_variants, media_links.
 *
 * The files sit in a volume on the server; the database holds metadata only.
 * storage_key: <tree_id>/<ab>/<cd>/<digest>-<variant>.webp. The digest is random per attempt,
 * not the content checksum, so a lost upload race cannot overwrite another's files.
 *
 * media_variants are the sizes sharp generates on upload.
 * media_links attach a file to an entity; crop_* gives the frame area as
 * fractions from 0 to 1, which turns a single group photograph into a
 * portrait for everybody on it.
 */

import { sql } from "drizzle-orm";
import {
    bigint,
    boolean,
    char,
    check,
    date,
    foreignKey,
    index,
    integer,
    jsonb,
    numeric,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import {
    datePrecisionEnum,
    dateQualifierEnum,
    familee,
    mediaKindEnum,
    mediaRoleEnum,
    mediaVariantEnum,
} from "./enums";
import { events } from "./events";
import { families } from "./families";
import { persons } from "./persons";
import { places } from "./places";
import { sources } from "./sources";
import { trees } from "./trees";

export const media = familee.table(
    "media",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),
        kind: mediaKindEnum("kind").notNull().default("photo"),

        storageKey: text("storage_key").notNull(),
        checksumSha256: char("checksum_sha256", { length: 64 }).notNull(),
        originalFilename: text("original_filename"),
        mimeType: text("mime_type").notNull(),
        byteSize: bigint("byte_size", { mode: "number" }).notNull(),
        width: integer("width"),
        height: integer("height"),

        title: text("title"),
        description: text("description"),
        placeId: uuid("place_id").references(() => places.id, {
            onDelete: "set null",
        }),

        /** When it was taken - a fuzzy date as well. */
        takenQualifier: dateQualifierEnum("taken_qualifier").notNull().default("exact"),
        takenPrecision: datePrecisionEnum("taken_precision").notNull().default("day"),
        takenStart: date("taken_start", { mode: "string" }),
        takenEnd: date("taken_end", { mode: "string" }),
        takenOriginal: text("taken_original"),

        exif: jsonb("exif").$type<Record<string, unknown>>(),

        uploadedBy: text("uploaded_by").references(() => users.id, {
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
        /** One and the same file cannot be uploaded to a tree twice. */
        unique("media_checksum_key").on(t.treeId, t.checksumSha256),
        unique("media_storage_key_key").on(t.storageKey),
        check("media_byte_size_positive", sql`${t.byteSize} > 0`),
        check("media_checksum_format", sql`${t.checksumSha256} ~ '^[0-9a-f]{64}$'`),
        check(
            "media_dimensions_positive",
            sql`(${t.width} is null or ${t.width} > 0) and (${t.height} is null or ${t.height} > 0)`,
        ),
        check(
            "media_taken_order",
            sql`${t.takenStart} is null or ${t.takenEnd} is null or ${t.takenStart} <= ${t.takenEnd}`,
        ),
        index("media_tree_idx").on(t.treeId, t.createdAt.desc()),
        index("media_place_idx").on(t.placeId),
        /** The composite key the tags of media_people point at (migration 0014). */
        unique("media_tree_id_id_key").on(t.treeId, t.id),
    ],
);

export const mediaVariants = familee.table(
    "media_variants",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        mediaId: uuid("media_id")
            .notNull()
            .references(() => media.id, { onDelete: "cascade" }),
        variant: mediaVariantEnum("variant").notNull(),

        /** 'avif', 'webp', 'jpeg'. */
        format: text("format").notNull(),

        storageKey: text("storage_key").notNull(),
        width: integer("width").notNull(),
        height: integer("height").notNull(),
        byteSize: bigint("byte_size", { mode: "number" }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        unique("media_variants_key").on(t.mediaId, t.variant, t.format),
        unique("media_variants_storage_key_key").on(t.storageKey),
        check(
            "media_variants_positive",
            sql`${t.width} > 0 and ${t.height} > 0 and ${t.byteSize} > 0`,
        ),
    ],
);

export const mediaLinks = familee.table(
    "media_links",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        mediaId: uuid("media_id")
            .notNull()
            .references(() => media.id, { onDelete: "cascade" }),

        /** Exactly one of the five is filled - media_links_target_xor. */
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
        /** The foreign key is added apart: sources is created after media_links. */
        sourceId: uuid("source_id"),

        role: mediaRoleEnum("role").notNull().default("gallery"),

        /** The photo shown on the card in the tree. */
        isPrimary: boolean("is_primary").notNull().default(false),

        /** Frame fractions 0..1: numeric(6,5) read as number, precision is enough. */
        cropX: numeric("crop_x", { precision: 6, scale: 5, mode: "number" }),
        cropY: numeric("crop_y", { precision: 6, scale: 5, mode: "number" }),
        cropW: numeric("crop_w", { precision: 6, scale: 5, mode: "number" }),
        cropH: numeric("crop_h", { precision: 6, scale: 5, mode: "number" }),

        caption: text("caption"),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        foreignKey({
            columns: [t.sourceId],
            foreignColumns: [sources.id],
            name: "media_links_source_fk",
        }).onDelete("cascade"),

        check(
            "media_links_target_xor",
            sql`(${t.personId} is not null)::int + (${t.familyId} is not null)::int + (${t.eventId} is not null)::int + (${t.placeId} is not null)::int + (${t.sourceId} is not null)::int = 1`,
        ),
        check(
            "media_links_crop_complete",
            sql`(${t.cropX} is null and ${t.cropY} is null and ${t.cropW} is null and ${t.cropH} is null) or (${t.cropX} is not null and ${t.cropY} is not null and ${t.cropW} is not null and ${t.cropH} is not null)`,
        ),
        check(
            "media_links_crop_range",
            sql`${t.cropX} is null or (${t.cropX} >= 0 and ${t.cropY} >= 0 and ${t.cropW} > 0 and ${t.cropH} > 0 and ${t.cropX} + ${t.cropW} <= 1 and ${t.cropY} + ${t.cropH} <= 1)`,
        ),

        index("media_links_media_idx").on(t.mediaId),
        index("media_links_person_idx").on(t.personId, t.sortOrder),
        index("media_links_family_idx").on(t.familyId),
        index("media_links_event_idx").on(t.eventId),

        /** One main photo per person and one link of a file to a person. */
        uniqueIndex("media_links_person_primary_key")
            .on(t.personId)
            .where(sql`is_primary and person_id is not null`),
        uniqueIndex("media_links_media_person_key")
            .on(t.mediaId, t.personId)
            .where(sql`person_id is not null`),
        /** One link of a file to an event (migration 0016). */
        uniqueIndex("media_links_media_event_key")
            .on(t.mediaId, t.eventId)
            .where(sql`event_id is not null`),
    ],
);

/**
 * The people who are in a photograph (migration 0014). An album link says whose photograph it is;
 * a tag says who is on it, and a photograph may have both without the two being the same person.
 */
export const mediaPeople = familee.table(
    "media_people",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),
        mediaId: uuid("media_id").notNull(),
        personId: uuid("person_id").notNull(),

        createdBy: text("created_by").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        /** The identifiers never cross trees. */
        foreignKey({
            name: "media_people_media_fk",
            columns: [t.treeId, t.mediaId],
            foreignColumns: [media.treeId, media.id],
        }).onDelete("cascade"),
        foreignKey({
            name: "media_people_person_fk",
            columns: [t.treeId, t.personId],
            foreignColumns: [persons.treeId, persons.id],
        }).onDelete("cascade"),

        uniqueIndex("media_people_media_person_key").on(t.mediaId, t.personId),
        index("media_people_person_idx").on(t.personId),
    ],
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type MediaVariantRow = typeof mediaVariants.$inferSelect;
export type NewMediaVariantRow = typeof mediaVariants.$inferInsert;
export type MediaLink = typeof mediaLinks.$inferSelect;
export type NewMediaLink = typeof mediaLinks.$inferInsert;
export type MediaPerson = typeof mediaPeople.$inferSelect;
export type NewMediaPerson = typeof mediaPeople.$inferInsert;
