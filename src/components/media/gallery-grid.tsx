"use client";

/**
 * Familee - the gallery of a tree: every photograph of the archive in one grid.
 *
 * A click opens the shared window; under each picture the people it is attached to are named
 * and link to their cards.
 */

import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { Lightbox, photoUrl } from "@/components/media/lightbox";
import { MediaIcon } from "@/components/media/media-icon";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteLooseMediaAction } from "@/lib/actions/photos";
import { formatDay } from "@/lib/day";

export type GalleryPhoto = {
    mediaId: string;
    /** photo · document · audio · video · other. */
    kind: string;
    /** The type the archive serves it as, so the window knows how to show it. */
    mimeType: string;
    /** The name the file came from, shown for a document. */
    name: string | null;
    /** The day the picture was taken, as "2007-04-21"; null when the file did not say. */
    takenStart: string | null;
    /** What is written under the picture, one entry per album that holds it. */
    captions: string[];
    /** Who is in the picture, by the name the tree gives them (the tags). */
    tagged: string[];
    /** The people the picture is attached to: the owner of the album, or the person of the event. */
    people: { personId: string; name: string }[];
    /** The events the photograph is attached to: their type and value, shown as captions. */
    events: { type: string; value: string | null }[];
    /** Nothing points at the file, so an editor may delete it (the "outside the albums" section). */
    deletable?: boolean;
};

export function GalleryGrid({
    slug,
    photos,
    canEdit = false,
}: {
    slug: string;
    photos: GalleryPhoto[];
    /** Editors see the delete button of a deletable file; the server checks the role again. */
    canEdit?: boolean;
}) {
    const t = useTranslations();
    const locale = useLocale();
    const router = useRouter();
    const [viewing, setViewing] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function deleteNow(mediaId: string) {
        setDeleting(null);
        setBusy(true);
        setError(null);
        try {
            const result = await deleteLooseMediaAction({ slug, mediaId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        } catch {
            setError(t("media.errors.failed"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {photos.map((photo, index) => (
                    <li
                        key={photo.mediaId}
                        className="card card-border overflow-hidden bg-base-100"
                    >
                        <button
                            type="button"
                            onClick={() => setViewing(index)}
                            aria-label={
                                photo.kind === "photo"
                                    ? (photo.captions[0] ??
                                      (photo.takenStart
                                          ? formatDay(photo.takenStart, locale)
                                          : t("media.one")))
                                    : (photo.name ?? t("media.file"))
                            }
                            className="block aspect-square w-full overflow-hidden bg-base-200"
                        >
                            {photo.kind === "photo" ? (
                                /* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized as a thumbnail */
                                <img
                                    src={photoUrl(slug, photo.mediaId, "thumb")}
                                    alt=""
                                    loading="lazy"
                                    className="size-full object-cover"
                                />
                            ) : (
                                <span className="flex size-full flex-col items-center justify-center gap-2 p-3 text-base-content/60">
                                    <MediaIcon kind={photo.kind} className="size-10" />
                                    <span className="line-clamp-2 break-all text-center">
                                        {photo.name ?? t("media.file")}
                                    </span>
                                </span>
                            )}
                        </button>
                        <div className="flex flex-col gap-1 p-2 text-xs">
                            {photo.takenStart && (
                                <span className="text-base-content/60">
                                    {formatDay(photo.takenStart, locale)}
                                </span>
                            )}
                            {photo.captions.map((caption) => (
                                <span key={caption} className="text-base-content/70">
                                    {caption}
                                </span>
                            ))}
                            {photo.tagged.length > 0 && (
                                <span className="truncate text-base-content/50">
                                    {t("media.taggedIn")}: {photo.tagged.join(", ")}
                                </span>
                            )}
                            {photo.people.length === 0 &&
                                photo.events.length === 0 &&
                                photo.tagged.length === 0 &&
                                photo.captions.length === 0 && (
                                    <span className="text-base-content/60">
                                        {t("gallery.unattached")}
                                    </span>
                                )}
                            {photo.people.map((person) => (
                                <Link
                                    key={person.personId}
                                    href={`/trees/${slug}/persons/${person.personId}`}
                                    className="link truncate"
                                >
                                    {person.name || t("common.unknown")}
                                </Link>
                            ))}
                            {photo.events.map((event) => (
                                <span
                                    key={`${event.type}:${event.value ?? ""}`}
                                    className="truncate text-base-content/70"
                                >
                                    {t(`events.${event.type}` as "events.birth")}
                                    {event.value ? ` · ${event.value}` : ""}
                                </span>
                            ))}
                            {canEdit && photo.deletable && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-xs mt-1 w-fit text-error"
                                    disabled={busy}
                                    onClick={() => setDeleting(photo.mediaId)}
                                >
                                    <Trash2 className="size-3.5" />
                                    {t("common.delete")}
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={deleting !== null}
                title={t("media.deleteTitle")}
                message={t("media.deleteConfirm")}
                confirmLabel={t("common.delete")}
                danger
                onConfirm={() => {
                    if (deleting) void deleteNow(deleting);
                }}
                onCancel={() => setDeleting(null)}
            />

            {viewing !== null && photos[viewing] && (
                <Lightbox
                    slug={slug}
                    photos={photos.map((photo) => ({
                        mediaId: photo.mediaId,
                        kind: photo.kind,
                        mimeType: photo.mimeType,
                        name: photo.name,
                        caption: photo.captions[0] ?? null,
                        tagged: photo.tagged,
                        date: photo.takenStart,
                    }))}
                    index={viewing}
                    onIndex={setViewing}
                    onClose={() => setViewing(null)}
                />
            )}
        </>
    );
}
