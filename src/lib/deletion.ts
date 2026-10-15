/**
 * Familee - the trash: deleting a person or a whole tree, with everything that belongs to it
 *
 * A person is not removed: deleted_at marks him as deleted and every read hides such a person
 * (see the views in migration 0012), so a mistake costs one update to undo. What the trash cannot
 * give back is the union of a person who was buried for good - that is what purge does, and it is
 * the only place that touches the files.
 *
 * The database removes the rows through its foreign keys (names, events, citations, notes, links,
 * unions the person leaves empty). What the foreign keys cannot reach is the photograph files on
 * the volume: this module collects their keys before the rows go, and the caller removes the files
 * after the transaction has committed, so a failed purge never leaves a file gone while its row
 * still exists.
 */

import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db, schema } from "@/db";

export type TrashedPerson = {
    personId: string;
    name: string | null;
    deletedAt: Date | null;
    deletedBy: string | null;
    deletedByName: string | null;
};

/** The people of a tree who are in its trash, most recently deleted first. */
export async function listTrashedPersons(treeId: string): Promise<TrashedPerson[]> {
    return db
        .select({
            personId: schema.persons.id,
            name: schema.personNames.display,
            deletedAt: schema.persons.deletedAt,
            deletedBy: schema.persons.deletedBy,
            deletedByName: schema.users.name,
        })
        .from(schema.persons)
        .leftJoin(
            schema.personNames,
            and(
                eq(schema.personNames.personId, schema.persons.id),
                eq(schema.personNames.isPrimary, true),
            ),
        )
        .leftJoin(schema.users, eq(schema.users.id, schema.persons.deletedBy))
        .where(and(eq(schema.persons.treeId, treeId), isNotNull(schema.persons.deletedAt)))
        .orderBy(desc(schema.persons.deletedAt));
}

/**
 * Moves a person to the trash. Nothing else changes: the names, the events, the photographs and
 * the unions stay where they are, and the union stops being drawn only because it has no living
 * partner left. Returns false when the person is not in the tree or is already in the trash.
 */
export async function trashPersonData(
    treeId: string,
    personId: string,
    userId: string | null,
): Promise<boolean> {
    const rows = await db
        .update(schema.persons)
        .set({ deletedAt: sql`now()`, deletedBy: userId })
        .where(
            and(
                eq(schema.persons.id, personId),
                eq(schema.persons.treeId, treeId),
                isNull(schema.persons.deletedAt),
            ),
        )
        .returning({ id: schema.persons.id });

    return rows.length > 0;
}

/** Takes a person out of the trash. Returns false when there was no such person in it. */
export async function restorePersonData(treeId: string, personId: string): Promise<boolean> {
    const rows = await db
        .update(schema.persons)
        .set({ deletedAt: null, deletedBy: null })
        .where(
            and(
                eq(schema.persons.id, personId),
                eq(schema.persons.treeId, treeId),
                isNotNull(schema.persons.deletedAt),
            ),
        )
        .returning({ id: schema.persons.id });

    return rows.length > 0;
}

/**
 * Removes one person from the trash for good, with everything only that person owns. Returns the
 * storage keys of the photographs that no longer belong to anyone (to be removed from disk), or
 * null when the person is not in the trash of this tree.
 *
 * A union is removed when the person was its last partner or child; a union with other members
 * stays. A photograph stays while any other person, event or union still links to it.
 */
export async function purgePersonData(treeId: string, personId: string): Promise<string[] | null> {
    return db.transaction(async (tx) => {
        const [person] = await tx
            .select({ id: schema.persons.id })
            .from(schema.persons)
            .where(
                and(
                    eq(schema.persons.id, personId),
                    eq(schema.persons.treeId, treeId),
                    isNotNull(schema.persons.deletedAt),
                ),
            )
            .limit(1);
        if (!person) return null;

        const eventRows = await tx
            .select({ id: schema.events.id })
            .from(schema.events)
            .where(and(eq(schema.events.treeId, treeId), eq(schema.events.personId, personId)));
        const eventIds = eventRows.map((row) => row.id);

        // Unions in which this person is a partner or a child, and no one else is.
        const unionRows = await tx
            .select({ id: schema.families.id })
            .from(schema.families)
            .where(
                sql`${schema.families.treeId} = ${treeId}
                    and (exists (select 1 from familee.family_partners fp
                                  where fp.family_id = ${schema.families.id} and fp.person_id = ${personId})
                         or exists (select 1 from familee.family_children fc
                                     where fc.family_id = ${schema.families.id} and fc.person_id = ${personId}))
                    and not exists (select 1 from familee.family_partners fp
                                     where fp.family_id = ${schema.families.id} and fp.person_id <> ${personId})
                    and not exists (select 1 from familee.family_children fc
                                     where fc.family_id = ${schema.families.id} and fc.person_id <> ${personId})`,
            );
        const unionIds = unionRows.map((row) => row.id);

        const unionEventRows = unionIds.length
            ? await tx
                  .select({ id: schema.events.id })
                  .from(schema.events)
                  .where(inArray(schema.events.familyId, unionIds))
            : [];
        const allEventIds = [...eventIds, ...unionEventRows.map((row) => row.id)];

        // Photographs that are linked to this person, to his events or to the unions that go.
        const linkConditions = [eq(schema.mediaLinks.personId, personId)];
        if (allEventIds.length)
            linkConditions.push(inArray(schema.mediaLinks.eventId, allEventIds));
        if (unionIds.length) linkConditions.push(inArray(schema.mediaLinks.familyId, unionIds));
        const candidateRows = await tx
            .selectDistinct({ mediaId: schema.mediaLinks.mediaId })
            .from(schema.mediaLinks)
            .where(or(...linkConditions));
        const candidateIds = candidateRows.map((row) => row.mediaId);

        // The rows go: the person (with names, events, citations, notes and links through the
        // foreign keys) and the unions that were his alone.
        await tx
            .delete(schema.persons)
            .where(and(eq(schema.persons.id, personId), eq(schema.persons.treeId, treeId)));
        if (unionIds.length) {
            await tx.delete(schema.families).where(inArray(schema.families.id, unionIds));
        }

        // A photograph nobody links to any more goes with its variants; its keys go to the caller.
        if (candidateIds.length === 0) return [];
        const stillLinked = await tx
            .selectDistinct({ mediaId: schema.mediaLinks.mediaId })
            .from(schema.mediaLinks)
            .where(inArray(schema.mediaLinks.mediaId, candidateIds));
        const linkedIds = new Set(stillLinked.map((row) => row.mediaId));
        const orphanIds = candidateIds.filter((id) => !linkedIds.has(id));
        if (orphanIds.length === 0) return [];

        const variants = await tx
            .select({ key: schema.mediaVariants.storageKey })
            .from(schema.mediaVariants)
            .where(inArray(schema.mediaVariants.mediaId, orphanIds));
        await tx.delete(schema.media).where(inArray(schema.media.id, orphanIds));
        return variants.map((variant) => variant.key);
    });
}

/**
 * Deletes a tree: the row goes, and every table of the tree cascades with it. The photographs
 * and any other file are in the tree's own folder on the volume, so the folder goes too.
 */
export async function deleteTreeData(treeId: string): Promise<void> {
    await db.delete(schema.trees).where(eq(schema.trees.id, treeId));
}
