/**
 * Familee - reading invitations
 *
 * Not a server action: these functions are called only from server components,
 * after the caller's role in the tree has been checked. Keeping them out of the
 * "use server" modules means the browser cannot call them directly.
 */

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";

/** Pending invitations of a tree: not accepted, not revoked, not expired. */
export async function listPendingInvitations(treeId: string) {
    return db
        .select({
            id: schema.invitations.id,
            email: schema.invitations.email,
            role: schema.invitations.role,
            expiresAt: schema.invitations.expiresAt,
        })
        .from(schema.invitations)
        .where(
            and(
                eq(schema.invitations.treeId, treeId),
                isNull(schema.invitations.acceptedAt),
                isNull(schema.invitations.revokedAt),
                gt(schema.invitations.expiresAt, sql`now()`),
            ),
        )
        .orderBy(schema.invitations.createdAt);
}

/** The members of a tree with their names and e-mail addresses. */
export async function listMembers(treeId: string) {
    return db
        .select({
            userId: schema.treeMembers.userId,
            name: schema.users.name,
            email: schema.users.email,
            role: schema.treeMembers.role,
            joinedAt: schema.treeMembers.createdAt,
        })
        .from(schema.treeMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.treeMembers.userId))
        .where(eq(schema.treeMembers.treeId, treeId))
        .orderBy(schema.treeMembers.createdAt);
}

/** The trees a person is a member of, with their own role in each. */
export async function listTreesForUser(userId: string) {
    return db
        .select({
            slug: schema.trees.slug,
            title: schema.trees.title,
            role: schema.treeMembers.role,
            logoData: schema.trees.logoData,
        })
        .from(schema.treeMembers)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMembers.treeId))
        .where(eq(schema.treeMembers.userId, userId))
        .orderBy(schema.trees.title);
}

/** The invitation as seen by the invitee: the tree, the role, the state. */
export async function findInvitationByHash(tokenHash: string) {
    const [row] = await db
        .select({
            id: schema.invitations.id,
            email: schema.invitations.email,
            role: schema.invitations.role,
            expiresAt: schema.invitations.expiresAt,
            acceptedAt: schema.invitations.acceptedAt,
            revokedAt: schema.invitations.revokedAt,
            treeTitle: schema.trees.title,
            treeSlug: schema.trees.slug,
        })
        .from(schema.invitations)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.invitations.treeId))
        .where(eq(schema.invitations.tokenHash, tokenHash))
        .limit(1);
    return row ?? null;
}
