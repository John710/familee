/**
 * Familee - the schema and the enums
 *
 * Mirrors the "Enums" block of db/migrations/0000_init.sql.
 * The order of the values matches the SQL: for a Postgres enum the order
 * defines the sorting, so it must not be changed.
 *
 * The captions of the values are not stored in the database - they live in
 * messages/<locale>.json under keys of the form `enums.sex.male`.
 */

import { pgSchema } from "drizzle-orm/pg-core";

/** The whole application lives in its own schema, out of the way of other databases. */
export const familee = pgSchema("familee");

// ---------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------

export const appRoleEnum = familee.enum("app_role", ["admin", "editor", "viewer"]);

export const memberRoleEnum = familee.enum("member_role", ["owner", "admin", "editor", "viewer"]);

export const privacyLevelEnum = familee.enum("privacy_level", ["public", "members", "private"]);

// ---------------------------------------------------------------------
// Persons and names
// ---------------------------------------------------------------------

export const sexEnum = familee.enum("sex", ["male", "female", "unknown"]);

export const nameTypeEnum = familee.enum("name_type", [
    "birth",
    "married",
    "maiden",
    "also_known_as",
    "nickname",
    "religious",
    "immigrant",
    "legal",
    "transliteration",
    "other",
]);

// ---------------------------------------------------------------------
// Unions and parentage
// ---------------------------------------------------------------------

export const familyTypeEnum = familee.enum("family_type", [
    "marriage",
    "partnership",
    "civil_union",
    "single_parent",
    "unknown",
]);

export const familyStatusEnum = familee.enum("family_status", [
    "active",
    "divorced",
    "annulled",
    "widowed",
    "separated",
    "unknown",
]);

export const partnerRoleEnum = familee.enum("partner_role", [
    "husband",
    "wife",
    "partner",
    "unknown",
]);

export const childRelationEnum = familee.enum("child_relation", [
    "biological",
    "adopted",
    "step",
    "foster",
    "guardianship",
    "sealing",
    "unknown",
]);

// ---------------------------------------------------------------------
// Fuzzy dates
// ---------------------------------------------------------------------

export const dateQualifierEnum = familee.enum("date_qualifier", [
    "exact",
    "about",
    "before",
    "after",
    "between",
    "from_to",
    "estimated",
    "calculated",
    "unknown",
]);

export const datePrecisionEnum = familee.enum("date_precision", [
    "day",
    "month",
    "year",
    "decade",
    "century",
]);

export const calendarEnum = familee.enum("calendar", [
    "gregorian",
    "julian",
    "hebrew",
    "french_republican",
    "unknown",
]);

// ---------------------------------------------------------------------
// Events and places
// ---------------------------------------------------------------------

export const eventScopeEnum = familee.enum("event_scope", ["person", "family", "both"]);

export const placeKindEnum = familee.enum("place_kind", [
    "country",
    "region",
    "oblast",
    "krai",
    "republic",
    "district",
    "city",
    "town",
    "village",
    "settlement",
    "street",
    "building",
    "cemetery",
    "church",
    "hospital",
    "other",
]);

// ---------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------

export const mediaKindEnum = familee.enum("media_kind", [
    "photo",
    "document",
    "audio",
    "video",
    "other",
]);

export const mediaVariantEnum = familee.enum("media_variant", [
    "thumb",
    "small",
    "medium",
    "large",
    "original",
]);

export const mediaRoleEnum = familee.enum("media_role", [
    "portrait",
    "gallery",
    "document",
    "headstone",
    "signature",
    "other",
]);

// ---------------------------------------------------------------------
// The audit log
// ---------------------------------------------------------------------

export const auditActionEnum = familee.enum("audit_action", [
    "create",
    "update",
    "delete",
    "restore",
    "merge",
    "import",
    "export",
]);

// ---------------------------------------------------------------------
// String union types: handy for zod, for forms and for translation keys
// ---------------------------------------------------------------------

export type AppRole = (typeof appRoleEnum.enumValues)[number];
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type PrivacyLevel = (typeof privacyLevelEnum.enumValues)[number];
export type Sex = (typeof sexEnum.enumValues)[number];
export type NameType = (typeof nameTypeEnum.enumValues)[number];
export type FamilyType = (typeof familyTypeEnum.enumValues)[number];
export type FamilyStatus = (typeof familyStatusEnum.enumValues)[number];
export type PartnerRole = (typeof partnerRoleEnum.enumValues)[number];
export type ChildRelation = (typeof childRelationEnum.enumValues)[number];
export type DateQualifier = (typeof dateQualifierEnum.enumValues)[number];
export type DatePrecision = (typeof datePrecisionEnum.enumValues)[number];
export type Calendar = (typeof calendarEnum.enumValues)[number];
export type EventScope = (typeof eventScopeEnum.enumValues)[number];
export type PlaceKind = (typeof placeKindEnum.enumValues)[number];
export type MediaKind = (typeof mediaKindEnum.enumValues)[number];
export type MediaVariant = (typeof mediaVariantEnum.enumValues)[number];
export type MediaRole = (typeof mediaRoleEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];

/** Every enum value in one object: for selects and for validation. */
export const enumValues = {
    appRole: appRoleEnum.enumValues,
    memberRole: memberRoleEnum.enumValues,
    privacyLevel: privacyLevelEnum.enumValues,
    sex: sexEnum.enumValues,
    nameType: nameTypeEnum.enumValues,
    familyType: familyTypeEnum.enumValues,
    familyStatus: familyStatusEnum.enumValues,
    partnerRole: partnerRoleEnum.enumValues,
    childRelation: childRelationEnum.enumValues,
    dateQualifier: dateQualifierEnum.enumValues,
    datePrecision: datePrecisionEnum.enumValues,
    calendar: calendarEnum.enumValues,
    eventScope: eventScopeEnum.enumValues,
    placeKind: placeKindEnum.enumValues,
    mediaKind: mediaKindEnum.enumValues,
    mediaVariant: mediaVariantEnum.enumValues,
    mediaRole: mediaRoleEnum.enumValues,
    auditAction: auditActionEnum.enumValues,
} as const;
