"use client";

/**
 * Familee - the photograph album of a person
 *
 * Everybody in the tree sees the album; editors also upload, choose the main photograph
 * (the one on the card in the tree) and take photographs off the person. Files go to the
 * upload route one by one, so a large batch shows its progress and one bad file does not
 * stop the others. The server checks everything again. A click on a picture opens the
 * shared window (components/media/lightbox.tsx).
 */

import { ImagePlus, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { Lightbox, photoUrl } from "@/components/media/lightbox";
import { useRouter } from "@/i18n/navigation";
import { removePersonPhotoAction, setMainPhotoAction } from "@/lib/actions/photos";

export type AlbumPhoto = { mediaId: string; isPrimary: boolean };

const ACCEPT = "image/jpeg,image/png,image/webp";

export function PhotoAlbum({
    slug,
    personId,
    photos,
    canEdit,
}: {
    slug: string;
    personId: string;
    photos: AlbumPhoto[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [viewing, setViewing] = useState<number | null>(null);
    /** The photograph waiting for the confirmation dialog, if any. */
    const [removing, setRemoving] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function translate(key: string, values?: Record<string, string | number>) {
        return t(key as Parameters<typeof t>[0], values);
    }

    async function uploadOne(file: File): Promise<string | null> {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`/api/trees/${slug}/persons/${personId}/photos`, {
            method: "POST",
            body,
        });
        if (response.ok) return null;
        const data = (await response.json().catch(() => null)) as {
            error?: string;
            limit?: number;
        } | null;
        return translate(data?.error ?? "media.errors.failed", {
            limit: `${data?.limit ?? ""} MB`,
        });
    }

    async function onFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setError(null);
        const list = Array.from(files);
        const failures: string[] = [];
        for (const [index, file] of list.entries()) {
            setProgress({ done: index, total: list.length });
            const problem = await uploadOne(file);
            if (problem) failures.push(`${file.name}: ${problem}`);
        }
        setProgress(null);
        if (failures.length > 0) setError(failures.join(" · "));
        router.refresh();
    }

    function onMain(mediaId: string) {
        setError(null);
        startTransition(async () => {
            const result = await setMainPhotoAction({ slug, personId, mediaId });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            router.refresh();
        });
    }

    function removeNow(mediaId: string) {
        setRemoving(null);
        setError(null);
        startTransition(async () => {
            const result = await removePersonPhotoAction({ slug, personId, mediaId });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            // The photograph may have been the one open in the window.
            setViewing(null);
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-4">
            <p className="text-base-content/60 text-sm">{t("media.hint")}</p>

            {photos.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("media.empty")}</p>
            ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {photos.map((photo, index) => (
                        <li
                            key={photo.mediaId}
                            className="card card-border overflow-hidden bg-base-100"
                        >
                            <button
                                type="button"
                                onClick={() => setViewing(index)}
                                className="relative block aspect-square w-full overflow-hidden bg-base-200"
                            >
                                {/* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized as a thumbnail */}
                                <img
                                    src={photoUrl(slug, photo.mediaId, "thumb")}
                                    alt=""
                                    loading="lazy"
                                    className="size-full object-cover"
                                />
                                {photo.isPrimary && (
                                    <span className="badge badge-primary absolute top-2 left-2 gap-1">
                                        <Star className="size-3" />
                                        {t("media.portrait")}
                                    </span>
                                )}
                            </button>
                            {canEdit && (
                                <div className="flex items-center justify-between gap-2 p-2">
                                    {photo.isPrimary ? (
                                        <span className="text-base-content/60 text-xs">
                                            {t("media.portrait")}
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs"
                                            disabled={pending}
                                            onClick={() => onMain(photo.mediaId)}
                                        >
                                            {t("media.setPortrait")}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-xs btn-square text-error"
                                        aria-label={t("media.remove")}
                                        title={t("media.remove")}
                                        disabled={pending}
                                        onClick={() => setRemoving(photo.mediaId)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canEdit && (
                <label className="btn btn-primary btn-sm w-fit cursor-pointer">
                    <ImagePlus className="size-4" />
                    {progress
                        ? t("media.uploading", { done: progress.done + 1, total: progress.total })
                        : t("media.upload")}
                    <input
                        type="file"
                        accept={ACCEPT}
                        multiple
                        className="hidden"
                        disabled={progress !== null}
                        onChange={(event) => {
                            void onFiles(event.target.files);
                            event.target.value = "";
                        }}
                    />
                </label>
            )}

            {error && (
                <p role="alert" className="text-error text-sm">
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
                    if (removing) removeNow(removing);
                }}
                onCancel={() => setRemoving(null)}
            />

            {viewing !== null && photos[viewing] && (
                <Lightbox
                    slug={slug}
                    photos={photos}
                    index={viewing}
                    onIndex={setViewing}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
