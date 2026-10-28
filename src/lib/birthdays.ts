/**
 * Familee - the birthdays of the next two weeks across all the trees of one person
 *
 * Used by the bell in the top bar and by the home page. Only trees the person is a member of take
 * part, and within each tree only the living people whose birthday day is known (see lib/age.ts).
 */

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { type BirthdayEntry, todayIn, upcomingBirthdays } from "@/lib/age";
import { listPersonCards } from "@/lib/people";

export type UserBirthday = BirthdayEntry & {
    treeTitle: string;
    /** The person's card in the tree. */
    href: string;
};

export const BIRTHDAY_DAYS = 14;

type Card = Awaited<ReturnType<typeof listPersonCards>>[number];

/**
 * One card as the birthday lists read it. The picture is the small variant of the portrait, the
 * same route the tree cards use, so the access check of that route applies here too.
 */
export function birthdayInput(card: Card, slug: string) {
    return {
        personId: card.personId,
        name: card.fullName ?? "",
        birthDate: card.birthDate,
        birthPrecision: card.birthPrecision,
        birthQualifier: card.birthQualifier,
        isLiving: card.isLiving,
        photoUrl: card.portraitMediaId
            ? `/api/trees/${slug}/media/${card.portraitMediaId}/thumb`
            : null,
    };
}

export async function birthdaysForUser(
    userId: string,
    withinDays = BIRTHDAY_DAYS,
    limit = 20,
): Promise<UserBirthday[]> {
    const memberships = await db
        .select({
            treeId: schema.trees.id,
            slug: schema.trees.slug,
            title: schema.trees.title,
        })
        .from(schema.treeMembers)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMembers.treeId))
        .where(eq(schema.treeMembers.userId, userId));

    const today = todayIn();
    const all: UserBirthday[] = [];
    for (const tree of memberships) {
        const cards = await listPersonCards(tree.treeId);
        const entries = upcomingBirthdays(
            cards.map((card) => birthdayInput(card, tree.slug)),
            today,
            withinDays,
        );
        for (const entry of entries) {
            all.push({
                ...entry,
                treeTitle: tree.title,
                href: `/trees/${tree.slug}/persons/${entry.personId}`,
            });
        }
    }
    return all.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name)).slice(0, limit);
}
