"use server";

/**
 * Familee - handing out a password reset link
 *
 * There is no mail server, so an owner or an administrator of a tree gives the
 * reset link to the person in person or by a message they trust. The action works
 * only for a member of that same tree, and the link it returns is shown once.
 * Setting the new password happens on /reset-password with the token from the link.
 */

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { auth, resetLinkKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { atLeast, canResetPassword, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { normalizeEmail } from "@/lib/validation";

export type ResetResult = { ok: true; url: string } | { ok: false; error: string };

export async function issueResetLinkAction(input: {
    slug: string;
    email: string;
}): Promise<ResetResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "admin")) {
        return { ok: false, error: "auth.noPermission" };
    }

    const email = normalizeEmail(input.email);
    if (!email) return { ok: false, error: "validation.invalidEmail" };

    // Only a member of this tree can be given a reset link by its administrators.
    const [member] = await db
        .select({
            userId: schema.users.id,
            role: schema.treeMembers.role,
        })
        .from(schema.treeMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.treeMembers.userId))
        .where(and(eq(schema.treeMembers.treeId, access.treeId), eq(schema.users.email, email)))
        .limit(1);
    if (!member) return { ok: false, error: "members.notMember" };

    // The link takes the account over: an admin may not use it to become the owner.
    if (!canResetPassword(access.role as MemberRole, member.role as MemberRole)) {
        return { ok: false, error: "auth.noPermission" };
    }

    const base = process.env.BETTER_AUTH_URL ?? "";
    await auth.api.requestPasswordReset({
        body: { email, redirectTo: `${base}/reset-password` },
    });

    // The link is taken from Redis at once: it is not kept anywhere after it is shown.
    const url = await redis.getdel(resetLinkKey(email));
    if (!url) return { ok: false, error: "members.resetFailed" };

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "update",
        entityType: "password_reset",
        entityId: member.userId,
    });

    return { ok: true, url };
}
