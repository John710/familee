"use server";

/**
 * Familee - server actions for the first run and for invitations
 *
 * Both actions are reachable without a session by design: the first-run setup
 * happens before any account exists, and an invitation is accepted by someone
 * who has no account yet. Each action checks its own preconditions and returns
 * a translation key on failure; it never throws to the browser.
 */

import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import {
    AccountExistsError,
    createAccount,
    hasAnyAccount,
    SetupClosedError,
} from "@/lib/accounts";
import { writeAudit } from "@/lib/audit";
import { hashInvitationToken } from "@/lib/invitation-token";
import { getCurrentUser } from "@/lib/session";
import { normalizeEmail, validateName, validatePassword } from "@/lib/validation";

export type AccessResult =
    | { ok: true; email: string; slug?: string }
    | { ok: false; error: string };

export async function setupAction(input: {
    name: string;
    email: string;
    password: string;
}): Promise<AccessResult> {
    if (await hasAnyAccount()) {
        return { ok: false, error: "auth.setupClosed" };
    }

    const email = normalizeEmail(input.email);
    if (!email) return { ok: false, error: "validation.invalidEmail" };

    const name = validateName(input.name);
    if (!name) return { ok: false, error: "validation.required" };

    const password = validatePassword(input.password);
    if (password !== null) return { ok: false, error: password };

    try {
        await createAccount({ email, name, password: input.password, setup: true });
        return { ok: true, email };
    } catch (error) {
        if (error instanceof SetupClosedError) {
            return { ok: false, error: "auth.setupClosed" };
        }
        if (error instanceof AccountExistsError) {
            return { ok: false, error: "auth.accountExists" };
        }
        throw error;
    }
}

export async function acceptInvitationAction(input: {
    token: string;
    name?: string;
    password?: string;
}): Promise<AccessResult> {
    const [invitation] = await db
        .select({
            id: schema.invitations.id,
            treeId: schema.invitations.treeId,
            slug: schema.trees.slug,
            email: schema.invitations.email,
            role: schema.invitations.role,
            expiresAt: schema.invitations.expiresAt,
            acceptedAt: schema.invitations.acceptedAt,
            revokedAt: schema.invitations.revokedAt,
        })
        .from(schema.invitations)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.invitations.treeId))
        .where(eq(schema.invitations.tokenHash, hashInvitationToken(input.token)))
        .limit(1);

    if (!invitation) return { ok: false, error: "auth.invitationInvalid" };
    if (invitation.acceptedAt) return { ok: false, error: "auth.invitationUsed" };
    if (invitation.revokedAt) return { ok: false, error: "auth.invitationRevoked" };
    if (invitation.expiresAt.getTime() <= Date.now()) {
        return { ok: false, error: "auth.invitationExpired" };
    }

    let userId: string;
    const current = await getCurrentUser();

    if (current) {
        if (current.email !== invitation.email) {
            return { ok: false, error: "auth.invitationEmailMismatch" };
        }
        userId = current.id;
    } else {
        // Nobody is signed in: the invitee needs a new account, or has one already.
        const [existing] = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.email, invitation.email))
            .limit(1);
        if (existing) return { ok: false, error: "auth.accountExists" };

        const name = validateName(input.name ?? "");
        if (!name) return { ok: false, error: "validation.required" };

        const passwordError = validatePassword(input.password ?? "");
        if (passwordError !== null) return { ok: false, error: passwordError };

        try {
            const user = await createAccount({
                email: invitation.email,
                name,
                password: input.password ?? "",
            });
            userId = user.id;
        } catch (error) {
            if (error instanceof AccountExistsError) {
                return { ok: false, error: "auth.accountExists" };
            }
            throw error;
        }
    }

    // Claim the invitation and add the membership in one transaction. The
    // conditional update makes a double click or a race accept it only once.
    const claimed = await db.transaction(async (tx) => {
        const [row] = await tx
            .update(schema.invitations)
            .set({ acceptedAt: new Date(), acceptedBy: userId })
            .where(
                and(
                    eq(schema.invitations.id, invitation.id),
                    isNull(schema.invitations.acceptedAt),
                    isNull(schema.invitations.revokedAt),
                    gt(schema.invitations.expiresAt, new Date()),
                ),
            )
            .returning({ id: schema.invitations.id });

        if (!row) return false;

        await tx
            .insert(schema.treeMembers)
            .values({
                treeId: invitation.treeId,
                userId,
                role: invitation.role,
            })
            .onConflictDoNothing();
        return true;
    });

    if (!claimed) return { ok: false, error: "auth.invitationUsed" };

    await writeAudit({
        treeId: invitation.treeId,
        userId,
        action: "create",
        entityType: "tree_member",
        entityId: userId,
    });

    return { ok: true, email: invitation.email, slug: invitation.slug };
}
