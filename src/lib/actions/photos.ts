"use server";

/**
 * Familee - choosing the main photograph of a person and taking photographs off a person
 *
 * Both need the editor role or higher in the tree. The photograph must belong to the same
 * tree and be in the person's album; the checks are repeated here, not only in the page.
 */

import {
    type PhotoCrop,
    removePersonPhoto,
    removePhotoLink,
    setMainPhoto,
    setPortraitCrop,
} from "@/lib/photos";
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

export async function removeEventPhotoAction(input: {
    slug: string;
    eventId: string;
    mediaId: string;
}): Promise<PhotoResult> {
    if (!UUID.test(input.eventId) || !UUID.test(input.mediaId)) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const result = await removePhotoLink({
        treeId: access.treeId,
        target: { eventId: input.eventId },
        mediaId: input.mediaId,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** The crop must lie inside the picture and keep the square the card shows; null clears it. */
export async function setPortraitCropAction(input: {
    slug: string;
    personId: string;
    mediaId: string;
    crop: PhotoCrop | null;
}): Promise<PhotoResult> {
    if (!UUID.test(input.personId) || !UUID.test(input.mediaId)) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const crop = input.crop;
    if (crop) {
        const inside = [crop.x, crop.y, crop.w, crop.h].every(
            (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        );
        const fits = crop.x + crop.w <= 1.0001 && crop.y + crop.h <= 1.0001;
        if (!inside || !fits || crop.w <= 0 || crop.h <= 0) {
            return { ok: false, error: "media.errors.failed" };
        }
    }

    const result = await setPortraitCrop({
        treeId: access.treeId,
        personId: input.personId,
        mediaId: input.mediaId,
        crop,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}
