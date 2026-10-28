"use client";

/**
 * Familee - the photographs of one event: the documents and the moments the event stands for.
 *
 * Shown under the event in the person's list. Editors add and take off photographs; everybody
 * opens them in the shared window. The server checks every write again.
 */

import { ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { Lightbox, photoUrl } from "@/components/media/lightbox";
import { MediaIcon } from "@/components/media/media-icon";
import { useRouter } from "@/i18n/navigation";
import { removeEventPhotoAction } from "@/lib/actions/photos";

/** Photographs, documents, recordings and films: whatever a family keeps. */
const ACCEPT =
    "image/*,application/pdf,audio/*,video/*,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,.doc,.docx,.odt,.zip,.rar,.7z";

export function EventPhotos({
    slug,
    eventId,
    photos,
    canEdit,
}: {
    slug: string;
    eventId: string;
    photos: {
        mediaId: string;
        kind: string;
        mimeType: string;
        name: string | null;
        caption: string | null;
        date: string | null;
    }[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [viewing, setViewing] = useState<number | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function upload(files: FileList | null) {
        if (!files || files.length === 0) return;
        setBusy(true);
        setError(null);
        const failures: string[] = [];
        try {
            for (const file of Array.from(files)) {
                const body = new FormData();
                body.append("file", file);
                try {
                    const response = await fetch(`/api/trees/${slug}/events/${eventId}/photos`, {
                        method: "POST",
                        body,
                    });
                    if (!response.ok) {
                        const data = (await response.json().catch(() => null)) as {
                            error?: string;
                            limit?: number;
                        } | null;
                        failures.push(
                            `${file.name}: ${t((data?.error ?? "media.errors.failed") as Parameters<typeof t>[0], { limit: `${data?.limit ?? ""} MB` })}`,
                        );
                    }
                } catch {
                    // A dropped connection is a failure of this file, not of the whole batch.
                    failures.push(`${file.name}: ${t("media.errors.failed", { limit: "" })}`);
                }
            }
        } finally {
            setBusy(false);
            if (failures.length > 0) setError(failures.join(" · "));
            router.refresh();
        }
    }

    async function removeNow(mediaId: string) {
        setRemoving(null);
        setBusy(true);
        const result = await removeEventPhotoAction({ slug, eventId, mediaId });
        setBusy(false);
        if (!result.ok) {
            setError(t(result.error as Parameters<typeof t>[0]));
            return;
        }
        setViewing(null);
        router.refresh();
    }

    if (photos.length === 0 && !canEdit) return null;

    return (
        <div className="mt-1 flex flex-col gap-2">
            {photos.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                    {photos.map((photo, index) => (
                        <li key={photo.mediaId} className="relative">
                            <button
                                type="button"
                                onClick={() => setViewing(index)}
                                aria-label={
                                    photo.kind === "photo"
                                        ? (photo.caption ?? photo.date ?? t("media.one"))
                                        : (photo.name ?? t("media.file"))
                                }
                                className="block size-14 overflow-hidden rounded-box border border-base-300 bg-base-200"
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
                                    <span className="flex size-full items-center justify-center text-base-content/60">
                                        <MediaIcon kind={photo.kind} className="size-5" />
                                    </span>
                                )}
                            </button>
                            {canEdit && (
                                <button
                                    type="button"
                                    className="btn btn-circle btn-xs absolute -top-1.5 -right-1.5 bg-base-100 text-error"
                                    aria-label={t("media.remove")}
                                    disabled={busy}
                                    onClick={() => setRemoving(photo.mediaId)}
                                >
                                    <Trash2 className="size-3" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canEdit && (
                <label className="btn btn-ghost btn-xs w-fit cursor-pointer">
                    <ImagePlus className="size-3.5" />
                    {busy ? t("common.saving") : t("media.addToEvent")}
                    <input
                        type="file"
                        accept={ACCEPT}
                        multiple
                        className="hidden"
                        disabled={busy}
                        onChange={(event) => {
                            void upload(event.target.files);
                            event.target.value = "";
                        }}
                    />
                </label>
            )}

            {error && (
                <p role="alert" className="text-error text-xs">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={removing !== null}
                title={t("media.removeTitle")}
                message={t("media.removeConfirm")}
                confirmLabel={t("common.remove")}
                danger
                onConfirm={() => {
                    if (removing) void removeNow(removing);
                }}
                onCancel={() => setRemoving(null)}
            />

            {viewing !== null && photos[viewing] && (
                <Lightbox
                    slug={slug}
                    photos={photos.map((photo) => ({
                        mediaId: photo.mediaId,
                        kind: photo.kind,
                        mimeType: photo.mimeType,
                        name: photo.name,
                        caption: photo.caption,
                        date: photo.date,
                    }))}
                    index={viewing}
                    onIndex={setViewing}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
