"use server";

/**
 * Familee - changing the role of a member and revoking a member's access
 *
 * Owners and administrators manage members. An administrator cannot touch another
 * administrator or the owner; only the owner can change an administrator. Nobody
 * changes their own access here (leaving a tree is a separate step). The owner is
 * never granted by these actions: the roles offered are the invitable ones.
 */

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
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

    await db
        .update(schema.treeMembers)
        .set({ role, updatedAt: new Date() })
        .where(
            and(
                eq(schema.treeMembers.treeId, found.target.treeId),
                eq(schema.treeMembers.userId, input.userId),
            ),
        );

    await writeAudit({
        treeId: found.target.treeId,
        userId: found.target.actorId,
        action: "update",
        entityType: "tree_member",
        entityId: input.userId,
    });

    return { ok: true };
}

export async function removeMemberAction(input: {
    slug: string;
    userId: string;
}): Promise<MemberResult> {
    const found = await findManageableMember(input.slug, input.userId);
    if (!found.ok) return found;

    // The membership row also holds the person chosen as oneself; it goes with it.
    await db
        .delete(schema.treeMembers)
        .where(
            and(
                eq(schema.treeMembers.treeId, found.target.treeId),
                eq(schema.treeMembers.userId, input.userId),
            ),
        );

    await writeAudit({
        treeId: found.target.treeId,
        userId: found.target.actorId,
        action: "delete",
        entityType: "tree_member",
        entityId: input.userId,
    });

    return { ok: true };
}
