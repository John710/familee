/**
 * Familee - views
 *
 * Mirrors section 7 of db/migrations/0001_functions.sql:
 * parent_child, person_cards.
 *
 * Both are declared with .existing(): the views are created by the SQL
 * migration and drizzle-kit must not try to issue or drop them. What is here
 * is only the column description, so that queries against them are typed.
 *
 * The views hold not a single caption for the interface - only codes, dates
 * and numbers. The texts come from messages/<locale>.json.
 */

import {
    boolean,
    date,
    integer,
    jsonb,
    numeric,
    smallint,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

import {
    childRelationEnum,
    datePrecisionEnum,
    dateQualifierEnum,
    familee,
    partnerRoleEnum,
    privacyLevelEnum,
    sexEnum,
} from "./enums";

/**
 * Parent -> child edges unfolded from the unions: a ready-made input for
 * laying the tree out on the client. effective_relation takes account of
 * relation_by_partner - a child is born to the mother, adopted by the father.
 */
export const parentChild = familee
    .view("parent_child", {
        treeId: uuid("tree_id").notNull(),
        parentId: uuid("parent_id").notNull(),
        childId: uuid("child_id").notNull(),
        familyId: uuid("family_id").notNull(),
        parentRole: partnerRoleEnum("parent_role").notNull(),
        relation: childRelationEnum("relation").notNull(),
        effectiveRelation: childRelationEnum("effective_relation").notNull(),
        birthOrder: smallint("birth_order"),
    })
    .existing();

/**
 * The data of a card in the tree: name, life years, places, portrait and variants.
 * Assembled from persons, person_names, the primary birth/death events, places,
 * media_links and media_variants - one query instead of six.
 */
export const personCards = familee
    .view("person_cards", {
        personId: uuid("person_id").notNull(),
        treeId: uuid("tree_id").notNull(),
        sex: sexEnum("sex").notNull(),
        privacy: privacyLevelEnum("privacy").notNull(),
        headline: text("headline"),
        sortOrder: integer("sort_order"),
        gedcomXref: text("gedcom_xref"),

        /** person_names.display of the primary name: "Surname Given Patronymic". */
        fullName: text("full_name"),
        surname: text("surname"),
        given: text("given"),
        patronymic: text("patronymic"),
        nickname: text("nickname"),
        surnameAtBirth: text("surname_at_birth"),

        birthEventId: uuid("birth_event_id"),
        birthDate: date("birth_date", { mode: "string" }),
        birthDateEnd: date("birth_date_end", { mode: "string" }),
        birthQualifier: dateQualifierEnum("birth_qualifier"),
        birthPrecision: datePrecisionEnum("birth_precision"),
        birthOriginal: text("birth_original"),
        birthYear: integer("birth_year"),
        birthPlace: text("birth_place"),

        deathEventId: uuid("death_event_id"),
        deathDate: date("death_date", { mode: "string" }),
        deathDateEnd: date("death_date_end", { mode: "string" }),
        deathQualifier: dateQualifierEnum("death_qualifier"),
        deathPrecision: datePrecisionEnum("death_precision"),
        deathOriginal: text("death_original"),
        deathYear: integer("death_year"),
        deathPlace: text("death_place"),

        /**
         * The result of familee.derive_is_living(): the explicit value of the
         * person, otherwise derived from the birth date and
         * trees.living_cutoff_years. null - it could not be determined.
         */
        isLiving: boolean("is_living"),
        hideLiving: boolean("hide_living").notNull(),

        portraitMediaId: uuid("portrait_media_id"),
        portraitStorageKey: text("portrait_storage_key"),
        portraitWidth: integer("portrait_width"),
        portraitHeight: integer("portrait_height"),
        cropX: numeric("crop_x", { precision: 6, scale: 5, mode: "number" }),
        cropY: numeric("crop_y", { precision: 6, scale: 5, mode: "number" }),
        cropW: numeric("crop_w", { precision: 6, scale: 5, mode: "number" }),
        cropH: numeric("crop_h", { precision: 6, scale: 5, mode: "number" }),

        /** {"thumb.avif": "<storage_key>", "medium.webp": "..."} */
        portraitVariants: jsonb("portrait_variants").$type<Record<string, string>>(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
            mode: "date",
        }).notNull(),
    })
    .existing();

export type ParentChildEdge = typeof parentChild.$inferSelect;
export type PersonCard = typeof personCards.$inferSelect;
