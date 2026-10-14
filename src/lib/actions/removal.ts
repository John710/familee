"use server";

/**
 * Familee - server actions that delete a person or a whole tree, with their data and files
 *
 * Deleting a tree is for its owner only; deleting a person is for editors and above, like any
 * other change of the tree. Both check the caller's role here, not only in the page. The files are
 * removed before the rows: if that fails the rows still point at the files, and the action can be
 * run again.
 */

import { writeAudit } from "@/lib/audit";
import { deletePersonData, deleteTreeData } from "@/lib/deletion";
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

/** Deletes a person with his names, events, citations, notes, photographs and the unions he alone was in. */
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

    // The keys are collected inside the transaction; the files go after the rows are gone.
    const keys = await deletePersonData(access.treeId, input.personId);
    if (keys === null) return { ok: false, error: "person.notFound" };
    if (keys.length > 0) await removeMediaFiles(keys);

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "delete",
        entityType: "person",
        entityId: input.personId,
    });
    return { ok: true };
}
