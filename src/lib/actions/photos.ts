"use server";

/**
 * Familee - choosing the main photograph of a person and taking photographs off a person
 *
 * Both need the editor role or higher in the tree. The photograph must belong to the same
 * tree and be in the person's album; the checks are repeated here, not only in the page.
 */

import {
    movePhoto,
    type PhotoCrop,
    removePersonPhoto,
    removePhotoLink,
    setMainPhoto,
    setPhotoCaption,
    setPhotoDate,
    setPhotoPeople,
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

/** Writes what stands under one photograph of an album; an empty line clears the caption. */
export async function setPhotoCaptionAction(input: {
    slug: string;
    personId: string;
    mediaId: string;
    caption: string;
}): Promise<PhotoResult> {
    if (!UUID.test(input.personId) || !UUID.test(input.mediaId)) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const result = await setPhotoCaption({
        treeId: access.treeId,
        personId: input.personId,
        mediaId: input.mediaId,
        caption: input.caption,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Moves one photograph of an album one place; the main one stays first. */
export async function movePhotoAction(input: {
    slug: string;
    personId: string;
    mediaId: string;
    delta: number;
}): Promise<PhotoResult> {
    if (!UUID.test(input.personId) || !UUID.test(input.mediaId)) {
        return { ok: false, error: "media.errors.failed" };
    }
    if (input.delta !== -1 && input.delta !== 1) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const result = await movePhoto({
        treeId: access.treeId,
        personId: input.personId,
        mediaId: input.mediaId,
        delta: input.delta,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Writes the day a photograph was taken; an empty value clears it. */
export async function setPhotoDateAction(input: {
    slug: string;
    mediaId: string;
    date: string | null;
}): Promise<PhotoResult> {
    if (!UUID.test(input.mediaId)) return { ok: false, error: "media.errors.failed" };
    if (input.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const result = await setPhotoDate({
        treeId: access.treeId,
        mediaId: input.mediaId,
        date: input.date,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Sets who is in a photograph. The tags are replaced whole, so the caller sends them all. */
export async function tagPhotoPeopleAction(input: {
    slug: string;
    mediaId: string;
    personIds: string[];
}): Promise<PhotoResult> {
    if (!UUID.test(input.mediaId)) return { ok: false, error: "media.errors.failed" };
    if (!input.personIds.every((personId) => UUID.test(personId))) {
        return { ok: false, error: "media.errors.failed" };
    }
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;

    const result = await setPhotoPeople({
        treeId: access.treeId,
        mediaId: input.mediaId,
        personIds: input.personIds,
        userId: access.userId,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}
