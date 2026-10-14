/**
 * Familee - deleting a person or a whole tree, with everything that belongs to it
 *
 * The database deletes the rows through its foreign keys (names, events, citations, notes, links,
 * unions the person leaves empty). What the foreign keys cannot reach is the photograph files on
 * the volume: this module collects their keys before the rows go, and the caller removes the files
 * after the transaction has committed, so a failed delete never leaves a file gone while its row
 * still exists.
 */

import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db, schema } from "@/db";

/**
 * Deletes one person and everything only that person owns. Returns the storage keys of the
 * photographs that no longer belong to anyone (to be removed from disk), or null when the person
 * is not in the tree.
 *
 * A union is removed when the person was its last partner or child; a union with other members
 * stays. A photograph stays while any other person, event or union still links to it.
 */
export async function deletePersonData(treeId: string, personId: string): Promise<string[] | null> {
    return db.transaction(async (tx) => {
        const [person] = await tx
            .select({ id: schema.persons.id })
            .from(schema.persons)
            .where(and(eq(schema.persons.id, personId), eq(schema.persons.treeId, treeId)))
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
