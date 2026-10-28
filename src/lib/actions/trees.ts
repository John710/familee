"use server";

/**
 * Familee - server actions for trees and their members
 *
 * Every action first identifies the caller and then checks the caller's role in
 * the tree (src/lib/tree-access.ts). Nothing here trusts the browser about rights.
 */

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { createInvitationToken, INVITATION_DAYS } from "@/lib/invitation-token";
import { atLeast, INVITABLE_ROLES, type InvitableRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { isReservedSlug, normalizeEmail, validateName, validateSlug } from "@/lib/validation";

export type TreeResult<T extends object = object> =
    | ({ ok: true } & T)
    | { ok: false; error: string };

/** Creates a tree; the caller becomes its owner. */
export async function createTreeAction(input: {
    title: string;
    slug: string;
}): Promise<TreeResult<{ slug: string }>> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const title = validateName(input.title);
    if (!title) return { ok: false, error: "validation.required" };

    const slug = validateSlug(input.slug);
    if (!slug) return { ok: false, error: "tree.invalidSlug" };
    if (isReservedSlug(slug)) return { ok: false, error: "tree.slugReserved" };

    try {
        const treeId = await db.transaction(async (tx) => {
            const [tree] = await tx
                .insert(schema.trees)
                .values({ slug, title, createdBy: user.id })
                .returning({ id: schema.trees.id });
            if (!tree) throw new Error("insert into trees returned no row");

            await tx.insert(schema.treeMembers).values({
                treeId: tree.id,
                userId: user.id,
                role: "owner",
            });

            return tree.id;
        });

        await writeAudit({
            treeId,
            userId: user.id,
            action: "create",
            entityType: "tree",
            entityId: treeId,
        });

        return { ok: true, slug };
    } catch (error) {
        if (isUniqueViolation(error)) {
            return { ok: false, error: "tree.slugTaken" };
        }
        throw error;
    }
}

/** Creates an invitation and returns the link. The link is shown once. */
export async function createInvitationAction(input: {
    slug: string;
    email: string;
    role: string;
}): Promise<TreeResult<{ url: string; expiresAt: string }>> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role, "admin")) {
        return { ok: false, error: "auth.noPermission" };
    }

    const email = normalizeEmail(input.email);
    if (!email) return { ok: false, error: "validation.invalidEmail" };

    if (!(INVITABLE_ROLES as readonly string[]).includes(input.role)) {
        return { ok: false, error: "members.invalidRole" };
    }
    const role = input.role as InvitableRole;

    const [alreadyMember] = await db
        .select({ userId: schema.treeMembers.userId })
        .from(schema.treeMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.treeMembers.userId))
        .where(and(eq(schema.treeMembers.treeId, access.treeId), eq(schema.users.email, email)))
        .limit(1);
    if (alreadyMember) {
        return { ok: false, error: "members.alreadyMember" };
    }

    // One pending invitation per address and tree is enough; a second would only confuse.
    const [alreadyInvited] = await db
        .select({ id: schema.invitations.id })
        .from(schema.invitations)
        .where(
            and(
                eq(schema.invitations.treeId, access.treeId),
                eq(schema.invitations.email, email),
                isNull(schema.invitations.acceptedAt),
                isNull(schema.invitations.revokedAt),
                gt(schema.invitations.expiresAt, new Date()),
            ),
        )
        .limit(1);
    if (alreadyInvited) {
        return { ok: false, error: "members.alreadyInvited" };
    }

    const { token, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);

    const [created] = await db
        .insert(schema.invitations)
        .values({
            treeId: access.treeId,
            email,
            role,
            tokenHash,
            invitedBy: user.id,
            expiresAt,
        })
        .returning({ id: schema.invitations.id });
    if (!created) throw new Error("insert into invitations returned no row");

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "create",
        entityType: "invitation",
        entityId: created.id,
    });

    const base = process.env.BETTER_AUTH_URL ?? "";
    return {
        ok: true,
        url: `${base}/invite/${token}`,
        expiresAt: expiresAt.toISOString(),
    };
}

/**
 * Gives the calendar feed of a tree a new address. The old one is the key to the feed, every
 * member sees it and a removed member keeps it, so an administrator retires it this way. The new
 * token is made the way 0011_tree_calendar_token.sql makes the first one; the audit row records
 * the change but not the token, which would hand the feed to whoever reads the history.
 */
export async function rotateCalendarTokenAction(input: { slug: string }): Promise<TreeResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role, "admin")) {
        return { ok: false, error: "auth.noPermission" };
    }

    await db
        .update(schema.trees)
        .set({ calendarToken: sql`gen_random_uuid()` })
        .where(eq(schema.trees.id, access.treeId));

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "update",
        entityType: "calendar_feed",
        entityId: access.treeId,
    });

    return { ok: true };
}

/** Cancels a pending invitation. Accepted ones cannot be cancelled. */
export async function revokeInvitationAction(input: {
    slug: string;
    invitationId: string;
}): Promise<TreeResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role, "admin")) {
        return { ok: false, error: "auth.noPermission" };
    }

    const [revoked] = await db
        .update(schema.invitations)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(schema.invitations.id, input.invitationId),
                eq(schema.invitations.treeId, access.treeId),
                isNull(schema.invitations.acceptedAt),
                isNull(schema.invitations.revokedAt),
            ),
        )
        .returning({ id: schema.invitations.id });

    if (!revoked) return { ok: false, error: "members.invitationNotFound" };

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "delete",
        entityType: "invitation",
        entityId: revoked.id,
    });

    return { ok: true };
}
