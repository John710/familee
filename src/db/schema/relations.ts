/**
 * Familee - the relation graph for relational queries
 *
 * Makes db.query.persons.findMany({ with: { names: true } }) possible instead
 * of hand-written joins. It does not affect the database itself: this is a
 * description for TypeScript and the query builder only.
 *
 * Where two foreign keys lead to the same table (created_by and updated_by,
 * user_id and invited_by, parent_id of places) the relation carries a
 * relationName - otherwise Drizzle cannot tell which one is meant.
 *
 * Composite relations (tree_id, person_id) repeat the composite foreign keys
 * of 0000_init.sql: they keep entities of different trees from being joined.
 */

import { relations } from "drizzle-orm";
import { auditLog } from "./audit";
import { accounts, sessions, users } from "./auth";
import { events, eventTypes } from "./events";
import { families, familyChildren, familyPartners } from "./families";
import { media, mediaLinks, mediaVariants } from "./media";
import { treeMembers } from "./members";
import { notes } from "./notes";
import { personNames, persons } from "./persons";
import { places } from "./places";
import { citations, repositories, sources } from "./sources";
import { trees } from "./trees";

/* ------------------------------------------------------------------ *
 *  Access
 * ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
    sessions: many(sessions),
    accounts: many(accounts),
    createdTrees: many(trees),
    memberships: many(treeMembers, { relationName: "treeMemberUser" }),
    invitedMembers: many(treeMembers, { relationName: "treeMemberInviter" }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, {
        fields: [sessions.userId],
        references: [users.id],
    }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
    user: one(users, {
        fields: [accounts.userId],
        references: [users.id],
    }),
}));

/* ------------------------------------------------------------------ *
 *  Trees and members
 * ------------------------------------------------------------------ */

export const treesRelations = relations(trees, ({ one, many }) => ({
    creator: one(users, {
        fields: [trees.createdBy],
        references: [users.id],
    }),
    members: many(treeMembers),
    persons: many(persons),
    families: many(families),
    places: many(places),
    events: many(events),
    media: many(media),
    repositories: many(repositories),
    sources: many(sources),
    notes: many(notes),
    auditLog: many(auditLog),
}));

export const treeMembersRelations = relations(treeMembers, ({ one }) => ({
    tree: one(trees, {
        fields: [treeMembers.treeId],
        references: [trees.id],
    }),
    user: one(users, {
        fields: [treeMembers.userId],
        references: [users.id],
        relationName: "treeMemberUser",
    }),
    inviter: one(users, {
        fields: [treeMembers.invitedBy],
        references: [users.id],
        relationName: "treeMemberInviter",
    }),
    /** The person the member is themselves: the origin for kinship degrees. */
    selfPerson: one(persons, {
        fields: [treeMembers.selfPersonId],
        references: [persons.id],
    }),
}));

/* ------------------------------------------------------------------ *
 *  Persons
 * ------------------------------------------------------------------ */

export const personsRelations = relations(persons, ({ one, many }) => ({
    tree: one(trees, {
        fields: [persons.treeId],
        references: [trees.id],
    }),
    creator: one(users, {
        fields: [persons.createdBy],
        references: [users.id],
        relationName: "personCreator",
    }),
    updater: one(users, {
        fields: [persons.updatedBy],
        references: [users.id],
        relationName: "personUpdater",
    }),
    names: many(personNames),
    /** Unions where the person is a partner (marriages, partnerships). */
    partnerIn: many(familyPartners),
    /** Unions where the person is a child, that is to say their parents. */
    childIn: many(familyChildren),
    events: many(events),
    mediaLinks: many(mediaLinks),
    citations: many(citations),
    notes: many(notes),
}));

export const personNamesRelations = relations(personNames, ({ one }) => ({
    person: one(persons, {
        fields: [personNames.personId],
        references: [persons.id],
    }),
}));

/* ------------------------------------------------------------------ *
 *  Unions
 * ------------------------------------------------------------------ */

export const familiesRelations = relations(families, ({ one, many }) => ({
    tree: one(trees, {
        fields: [families.treeId],
        references: [trees.id],
    }),
    creator: one(users, {
        fields: [families.createdBy],
        references: [users.id],
        relationName: "familyCreator",
    }),
    updater: one(users, {
        fields: [families.updatedBy],
        references: [users.id],
        relationName: "familyUpdater",
    }),
    partners: many(familyPartners),
    children: many(familyChildren),
    events: many(events),
    mediaLinks: many(mediaLinks),
    citations: many(citations),
    notes: many(notes),
}));

export const familyPartnersRelations = relations(familyPartners, ({ one }) => ({
    family: one(families, {
        fields: [familyPartners.treeId, familyPartners.familyId],
        references: [families.treeId, families.id],
    }),
    person: one(persons, {
        fields: [familyPartners.treeId, familyPartners.personId],
        references: [persons.treeId, persons.id],
    }),
}));

export const familyChildrenRelations = relations(familyChildren, ({ one }) => ({
    family: one(families, {
        fields: [familyChildren.treeId, familyChildren.familyId],
        references: [families.treeId, families.id],
    }),
    person: one(persons, {
        fields: [familyChildren.treeId, familyChildren.personId],
        references: [persons.treeId, persons.id],
    }),
}));

/* ------------------------------------------------------------------ *
 *  Places
 * ------------------------------------------------------------------ */

export const placesRelations = relations(places, ({ one, many }) => ({
    tree: one(trees, {
        fields: [places.treeId],
        references: [trees.id],
    }),
    parent: one(places, {
        fields: [places.parentId],
        references: [places.id],
        relationName: "placeParent",
    }),
    children: many(places, { relationName: "placeParent" }),
    events: many(events),
    media: many(media),
    mediaLinks: many(mediaLinks),
    notes: many(notes),
}));

/* ------------------------------------------------------------------ *
 *  Events
 * ------------------------------------------------------------------ */

export const eventTypesRelations = relations(eventTypes, ({ many }) => ({
    events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
    tree: one(trees, {
        fields: [events.treeId],
        references: [trees.id],
    }),
    type: one(eventTypes, {
        fields: [events.typeCode],
        references: [eventTypes.code],
    }),
    person: one(persons, {
        fields: [events.treeId, events.personId],
        references: [persons.treeId, persons.id],
    }),
    family: one(families, {
        fields: [events.treeId, events.familyId],
        references: [families.treeId, families.id],
    }),
    place: one(places, {
        fields: [events.placeId],
        references: [places.id],
    }),
    creator: one(users, {
        fields: [events.createdBy],
        references: [users.id],
        relationName: "eventCreator",
    }),
    updater: one(users, {
        fields: [events.updatedBy],
        references: [users.id],
        relationName: "eventUpdater",
    }),
    mediaLinks: many(mediaLinks),
    citations: many(citations),
    notes: many(notes),
}));

/* ------------------------------------------------------------------ *
 *  Media
 * ------------------------------------------------------------------ */

export const mediaRelations = relations(media, ({ one, many }) => ({
    tree: one(trees, {
        fields: [media.treeId],
        references: [trees.id],
    }),
    place: one(places, {
        fields: [media.placeId],
        references: [places.id],
    }),
    uploader: one(users, {
        fields: [media.uploadedBy],
        references: [users.id],
    }),
    variants: many(mediaVariants),
    links: many(mediaLinks),
    notes: many(notes),
}));

export const mediaVariantsRelations = relations(mediaVariants, ({ one }) => ({
    media: one(media, {
        fields: [mediaVariants.mediaId],
        references: [media.id],
    }),
}));

export const mediaLinksRelations = relations(mediaLinks, ({ one }) => ({
    media: one(media, {
        fields: [mediaLinks.mediaId],
        references: [media.id],
    }),
    person: one(persons, {
        fields: [mediaLinks.personId],
        references: [persons.id],
    }),
    family: one(families, {
        fields: [mediaLinks.familyId],
        references: [families.id],
    }),
    event: one(events, {
        fields: [mediaLinks.eventId],
        references: [events.id],
    }),
    place: one(places, {
        fields: [mediaLinks.placeId],
        references: [places.id],
    }),
    source: one(sources, {
        fields: [mediaLinks.sourceId],
        references: [sources.id],
    }),
}));

/* ------------------------------------------------------------------ *
 *  Sources
 * ------------------------------------------------------------------ */

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
    tree: one(trees, {
        fields: [repositories.treeId],
        references: [trees.id],
    }),
    sources: many(sources),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
    tree: one(trees, {
        fields: [sources.treeId],
        references: [trees.id],
    }),
    repository: one(repositories, {
        fields: [sources.repositoryId],
        references: [repositories.id],
    }),
    citations: many(citations),
    mediaLinks: many(mediaLinks),
    notes: many(notes),
}));

export const citationsRelations = relations(citations, ({ one }) => ({
    source: one(sources, {
        fields: [citations.sourceId],
        references: [sources.id],
    }),
    person: one(persons, {
        fields: [citations.personId],
        references: [persons.id],
    }),
    family: one(families, {
        fields: [citations.familyId],
        references: [families.id],
    }),
    event: one(events, {
        fields: [citations.eventId],
        references: [events.id],
    }),
}));

/* ------------------------------------------------------------------ *
 *  Notes and the audit log
 * ------------------------------------------------------------------ */

export const notesRelations = relations(notes, ({ one }) => ({
    tree: one(trees, {
        fields: [notes.treeId],
        references: [trees.id],
    }),
    person: one(persons, {
        fields: [notes.personId],
        references: [persons.id],
    }),
    family: one(families, {
        fields: [notes.familyId],
        references: [families.id],
    }),
    event: one(events, {
        fields: [notes.eventId],
        references: [events.id],
    }),
    place: one(places, {
        fields: [notes.placeId],
        references: [places.id],
    }),
    source: one(sources, {
        fields: [notes.sourceId],
        references: [sources.id],
    }),
    media: one(media, {
        fields: [notes.mediaId],
        references: [media.id],
    }),
    creator: one(users, {
        fields: [notes.createdBy],
        references: [users.id],
    }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
    tree: one(trees, {
        fields: [auditLog.treeId],
        references: [trees.id],
    }),
    user: one(users, {
        fields: [auditLog.userId],
        references: [users.id],
    }),
}));
