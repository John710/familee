"use server";

/**
 * Familee - server actions that move a person to the trash, take him back, or remove him for good
 *
 * Deleting a tree is for its owner only. Moving a person to the trash and taking him out again are
 * like any other change of the tree: editors and above. Removing him for good is heavier - the
 * photograph files go with the rows - so it stays with the owner and the administrators.
 *
 * Files are always removed after the rows have gone: a failure then leaves the rows pointing at
 * files that are still there, and the action can be run again.
 */

import { writeAudit } from "@/lib/audit";
import {
    deleteTreeData,
    purgePersonData,
    restorePersonData,
    trashPersonData,
} from "@/lib/deletion";
import { removeMediaFiles, removeTreeFiles } from "@/lib/media-storage";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type RemovalResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deletes a tree with everything in it. The owner must type the tree's address to confirm. */
export async function deleteTreeAction(input: {
    slug: string;
    confirmSlug: string;
}): Promise<RemovalResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };
    const access = await getTreeAccess(input.slug, user.id);
    if (access?.role !== "owner") return { ok: false, error: "auth.noPermission" };
    if (input.confirmSlug !== input.slug) return { ok: false, error: "tree.delete.slugMismatch" };

    // The files first: the whole folder of the tree, with its photographs and any other file.
    await removeTreeFiles(access.treeId);
    await deleteTreeData(access.treeId);
    return { ok: true };
}

/**
 * Moves a person to the trash. Only the mark changes: the names, the events, the notes, the
 * photographs and the unions stay, and the tree simply stops showing him.
 */
export async function deletePersonAction(input: {
    slug: string;
    personId: string;
}): Promise<RemovalResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };
    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }
    if (!UUID.test(input.personId)) return { ok: false, error: "person.notFound" };

    const moved = await trashPersonData(access.treeId, input.personId, user.id);
    if (!moved) return { ok: false, error: "person.notFound" };

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "delete",
        entityType: "person",
        entityId: input.personId,
        changes: { trash: { from: false, to: true } },
    });
    return { ok: true };
}

/** Takes a person out of the trash. Everything he had was kept, so the tree shows him again. */
export async function restorePersonAction(input: {
    slug: string;
    personId: string;
}): Promise<RemovalResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };
    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }
    if (!UUID.test(input.personId)) return { ok: false, error: "trash.notFound" };

    const restored = await restorePersonData(access.treeId, input.personId);
    if (!restored) return { ok: false, error: "trash.notFound" };

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "restore",
        entityType: "person",
        entityId: input.personId,
    });
    return { ok: true };
}

/**
 * Removes a person from the trash for good, with his events, notes, citations and the photographs
 * that belonged to nobody else. The owner and the administrators only.
 */
export async function purgePersonAction(input: {
    slug: string;
    personId: string;
}): Promise<RemovalResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };
    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "admin")) {
        return { ok: false, error: "auth.noPermission" };
    }
    if (!UUID.test(input.personId)) return { ok: false, error: "trash.notFound" };

    // The keys are collected inside the transaction; the files go after the rows are gone.
    const keys = await purgePersonData(access.treeId, input.personId);
    if (keys === null) return { ok: false, error: "trash.notFound" };
    if (keys.length > 0) await removeMediaFiles(keys);

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "delete",
        entityType: "person",
        entityId: input.personId,
        changes: { purged: { from: false, to: true } },
    });
    return { ok: true };
}
