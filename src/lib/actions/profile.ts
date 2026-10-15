"use server";

/**
 * Familee - the profile: which person of a tree is the signed-in person
 *
 * The choice is made once per tree on the profile page, so no card of the tree
 * needs a checkbox. The person must belong to the tree, and one person can be
 * chosen by one member only.
 */

import { and, eq, ne } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type ProfileResult = { ok: true } | { ok: false; error: string };

export async function setSelfPersonAction(input: {
    slug: string;
    personId: string | null;
}): Promise<ProfileResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access) return { ok: false, error: "auth.noPermission" };

    if (input.personId !== null) {
        const [person] = await db
            .select({ id: schema.persons.id })
            .from(schema.persons)
            .where(
                and(
                    eq(schema.persons.id, input.personId),
                    eq(schema.persons.treeId, access.treeId),
                ),
            )
            .limit(1);
        if (!person) return { ok: false, error: "person.notFound" };

        const [taken] = await db
            .select({ userId: schema.treeMembers.userId })
            .from(schema.treeMembers)
            .where(
                and(
                    eq(schema.treeMembers.treeId, access.treeId),
                    eq(schema.treeMembers.selfPersonId, input.personId),
                    ne(schema.treeMembers.userId, user.id),
                ),
            )
            .limit(1);
        if (taken) return { ok: false, error: "profile.personTaken" };
    }

    // The check above is only a fast path: two members may pass it at the same time. The unique
    // index tree_members_self_person_key decides the race, and the loser is turned away here.
    let updated: { userId: string }[];
    try {
        updated = await db
            .update(schema.treeMembers)
            .set({
                selfPersonId: input.personId,
                selfChosenAt: input.personId ? new Date() : null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(schema.treeMembers.treeId, access.treeId),
                    eq(schema.treeMembers.userId, user.id),
                ),
            )
            .returning({ userId: schema.treeMembers.userId });
    } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, error: "profile.personTaken" };
        throw error;
    }

    // The membership can be removed between the access check and this write: nothing was
    // updated then, and no audit entry may claim otherwise.
    if (updated.length === 0) return { ok: false, error: "auth.noPermission" };

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "update",
        entityType: "tree_member",
        entityId: user.id,
    });

    return { ok: true };
}

/** postgres.js reports a unique index violation as SQLSTATE 23505. */
function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "23505"
    );
}
