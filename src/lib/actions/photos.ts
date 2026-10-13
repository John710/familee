"use server";

/**
 * Familee - choosing the main photograph of a person and taking photographs off a person
 *
 * Both need the editor role or higher in the tree. The photograph must belong to the same
 * tree and be in the person's album; the checks are repeated here, not only in the page.
 */

import { removePersonPhoto, setMainPhoto } from "@/lib/photos";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type PhotoResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function editorAccess(
    slug: string,
): Promise<{ ok: true; treeId: string; userId: string } | { ok: false; error: string }> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }
    return { ok: true, treeId: access.treeId, userId: user.id };
}

export async function setMainPhotoAction(input: {
    slug: string;
    personId: string;
    mediaId: string;
}): Promise<PhotoResult> {
    if (!UUID.test(input.personId) || !UUID.test(input.mediaId)) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const result = await setMainPhoto({
        treeId: access.treeId,
        personId: input.personId,
        mediaId: input.mediaId,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function removePersonPhotoAction(input: {
    slug: string;
    personId: string;
    mediaId: string;
}): Promise<PhotoResult> {
    if (!UUID.test(input.personId) || !UUID.test(input.mediaId)) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const result = await removePersonPhoto({
        treeId: access.treeId,
        personId: input.personId,
        mediaId: input.mediaId,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}
