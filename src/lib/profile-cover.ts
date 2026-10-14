/**
 * Familee - the picture on the profile: the portrait of the person the member chose as
 * themselves, most recently chosen first, across all the trees of the member.
 *
 * A member can be themselves in several trees. The newest choice is the cover; when that person
 * has no portrait, the next newest choice with a portrait is taken, so a choice without a picture
 * never hides the others.
 */

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { listPersonCards } from "@/lib/people";

export type ProfileCover = {
    /** The medium-sized picture, served by the tree's media route (the member is in the tree). */
    photoUrl: string;
    personName: string;
    treeTitle: string;
    /** The person's card in the tree. */
    href: string;
};

export async function profileCover(userId: string): Promise<ProfileCover | null> {
    const choices = await db
        .select({
            treeId: schema.trees.id,
            slug: schema.trees.slug,
            title: schema.trees.title,
            personId: schema.treeMembers.selfPersonId,
        })
        .from(schema.treeMembers)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMembers.treeId))
        .where(
            and(eq(schema.treeMembers.userId, userId), isNotNull(schema.treeMembers.selfPersonId)),
        )
        .orderBy(desc(schema.treeMembers.selfChosenAt));

    for (const choice of choices) {
        if (!choice.personId) continue;
        const card = (await listPersonCards(choice.treeId)).find(
            (candidate) => candidate.personId === choice.personId,
        );
        if (!card?.portraitMediaId) continue;
        return {
            photoUrl: `/api/trees/${choice.slug}/media/${card.portraitMediaId}/medium`,
            personName: card.fullName ?? "",
            treeTitle: choice.title,
            href: `/trees/${choice.slug}/persons/${choice.personId}`,
        };
    }
    return null;
}
