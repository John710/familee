"use server";

/**
 * Familee - changing the role of a member and revoking a member's access
 *
 * Owners and administrators manage members. An administrator cannot touch another
 * administrator or the owner; only the owner can change an administrator. Nobody
 * changes their own access here (leaving a tree is a separate step). The owner is
 * never granted by these actions: the roles offered are the invitable ones. A member who is
 * removed, or demoted below administrator, loses the pending invitations they created here.
 */

import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { clearedFields, diffFields, writeAudit } from "@/lib/audit";
import { atLeast, INVITABLE_ROLES, type InvitableRole, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type MemberResult = { ok: true } | { ok: false; error: string };

type Target = { treeId: string; actorId: string; role: MemberRole };

/** Checks the rights over the target member and returns its row, or an error key. */
async function findManageableMember(
    slug: string,
    targetUserId: string,
): Promise<{ ok: true; target: Target } | { ok: false; error: string }> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role, "admin")) {
        return { ok: false, error: "auth.noPermission" };
    }
    if (targetUserId === user.id) return { ok: false, error: "members.cannotChangeSelf" };

    const [member] = await db
        .select({ role: schema.treeMembers.role })
        .from(schema.treeMembers)
        .where(
            and(
                eq(schema.treeMembers.treeId, access.treeId),
                eq(schema.treeMembers.userId, targetUserId),
            ),
        )
        .limit(1);
    if (!member) return { ok: false, error: "members.notMember" };

    if (member.role === "owner") return { ok: false, error: "members.cannotManageOwner" };
    if (member.role === "admin" && access.role !== "owner") {
        return { ok: false, error: "members.cannotManageAdmin" };
    }

    return {
        ok: true,
        target: {
            treeId: access.treeId,
            actorId: user.id,
            role: member.role,
        },
    };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Revokes the pending invitations a member created in one tree. An invitation grants a role on
 * the authority of the admin who made it, so it must not outlive that authority: an admin who is
 * removed or demoted could otherwise still bring people in through links handed out before.
 * Returns the ids of the revoked invitations, for the audit rows.
 */
async function revokePendingInvitationsBy(
    tx: Transaction,
    treeId: string,
    inviterId: string,
): Promise<string[]> {
    const revoked = await tx
        .update(schema.invitations)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(schema.invitations.treeId, treeId),
                eq(schema.invitations.invitedBy, inviterId),
                isNull(schema.invitations.acceptedAt),
                isNull(schema.invitations.revokedAt),
            ),
        )
        .returning({ id: schema.invitations.id });
    return revoked.map((row) => row.id);
}

/** One audit row per invitation revoked along with its author's rights. */
async function auditRevokedInvitations(target: Target, ids: readonly string[]): Promise<void> {
    for (const id of ids) {
        await writeAudit({
            treeId: target.treeId,
            userId: target.actorId,
            action: "delete",
            entityType: "invitation",
            entityId: id,
        });
    }
}

export async function changeMemberRoleAction(input: {
    slug: string;
    userId: string;
    role: string;
}): Promise<MemberResult> {
    const found = await findManageableMember(input.slug, input.userId);
    if (!found.ok) return found;

    const role = (INVITABLE_ROLES as readonly string[]).includes(input.role)
        ? (input.role as InvitableRole)
        : null;
    if (!role) return { ok: false, error: "members.invalidRole" };

    const revoked = await db.transaction(async (tx) => {
        await tx
            .update(schema.treeMembers)
            .set({ role, updatedAt: new Date() })
            .where(
                and(
                    eq(schema.treeMembers.treeId, found.target.treeId),
                    eq(schema.treeMembers.userId, input.userId),
                ),
            );

        // Below admin the member can no longer invite, so their open invitations go too.
        return atLeast(role, "admin")
            ? []
            : revokePendingInvitationsBy(tx, found.target.treeId, input.userId);
    });

    await writeAudit({
        treeId: found.target.treeId,
        userId: found.target.actorId,
        action: "update",
        entityType: "tree_member",
        entityId: input.userId,
        changes: diffFields({ memberRole: found.target.role }, { memberRole: role }),
    });
    await auditRevokedInvitations(found.target, revoked);

    return { ok: true };
}

export async function removeMemberAction(input: {
    slug: string;
    userId: string;
}): Promise<MemberResult> {
    const found = await findManageableMember(input.slug, input.userId);
    if (!found.ok) return found;

    // The membership row also holds the person chosen as oneself; it goes with it, and so do the
    // invitations the member left open in this tree.
    const revoked = await db.transaction(async (tx) => {
        await tx
            .delete(schema.treeMembers)
            .where(
                and(
                    eq(schema.treeMembers.treeId, found.target.treeId),
                    eq(schema.treeMembers.userId, input.userId),
                ),
            );
        return revokePendingInvitationsBy(tx, found.target.treeId, input.userId);
    });

    await writeAudit({
        treeId: found.target.treeId,
        userId: found.target.actorId,
        action: "delete",
        entityType: "tree_member",
        entityId: input.userId,
        changes: clearedFields({ memberRole: found.target.role }),
    });
    await auditRevokedInvitations(found.target, revoked);

    return { ok: true };
}
