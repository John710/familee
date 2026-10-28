/**
 * Familee - reading invitations
 *
 * Not a server action: these functions are called only from server components,
 * after the caller's role in the tree has been checked. Keeping them out of the
 * "use server" modules means the browser cannot call them directly.
 */

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import type { AccountStanding, Membership } from "@/lib/roles";

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

/**
 * The global role and every membership of each account, for canResetAccount(): a reset link
 * reaches the whole account, so both the members page and the reset action weigh all its trees.
 * An account that does not exist is missing from the map.
 */
export async function listAccountStandings(
    userIds: readonly string[],
): Promise<Map<string, AccountStanding>> {
    const standings = new Map<string, { globalRole: string; memberships: Membership[] }>();
    if (userIds.length === 0) return standings;

    const users = await db
        .select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(inArray(schema.users.id, [...userIds]));
    for (const row of users) standings.set(row.id, { globalRole: row.role, memberships: [] });

    const memberships = await db
        .select({
            userId: schema.treeMembers.userId,
            treeId: schema.treeMembers.treeId,
            role: schema.treeMembers.role,
        })
        .from(schema.treeMembers)
        .where(inArray(schema.treeMembers.userId, [...userIds]));
    for (const row of memberships) {
        standings.get(row.userId)?.memberships.push({ treeId: row.treeId, role: row.role });
    }
    return standings;
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
