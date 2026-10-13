"use client";

/**
 * Familee - the photograph album of a person
 *
 * Everybody in the tree sees the album; editors also upload, choose the main photograph
 * (the one on the card in the tree) and take photographs off the person. Files go to the
 * upload route one by one, so a large batch shows its progress and one bad file does not
 * stop the others. The server checks everything again.
 *
 * A click on a picture opens it in a window over the page, in its medium size. From there
 * the arrows (keys or buttons, or a swipe on a phone) turn to the next and previous photo;
 * Escape or a click outside the picture closes the window.
 */

import { ChevronLeft, ChevronRight, ImagePlus, Star, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { removePersonPhotoAction, setMainPhotoAction } from "@/lib/actions/photos";

export type AlbumPhoto = { mediaId: string; isPrimary: boolean };

type Variant = "thumb" | "medium" | "original";

const ACCEPT = "image/jpeg,image/png,image/webp";
/** A horizontal swipe of this many pixels turns the page of the lightbox. */
const SWIPE_PIXELS = 50;

function photoUrl(slug: string, mediaId: string, variant: Variant) {
    return `/api/trees/${slug}/media/${mediaId}/${variant}`;
}

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

/** The window over the page that shows one photograph and turns the album. */
function Lightbox({
    slug,
    photos,
    index,
    onIndex,
    onClose,
}: {
    slug: string;
    photos: AlbumPhoto[];
    index: number;
    onIndex: (index: number) => void;
    onClose: () => void;
}) {
    const t = useTranslations();
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const total = photos.length;
    const current = photos[index];

    const previous = () => onIndex((index - 1 + total) % total);
    const next = () => onIndex((index + 1) % total);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowLeft") onIndex((index - 1 + total) % total);
            if (event.key === "ArrowRight") onIndex((index + 1) % total);
        };
        window.addEventListener("keydown", onKey);
        // The page behind does not scroll while the window is open.
        const { overflow } = document.body.style;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
        };
    }, [index, total, onIndex, onClose]);

    if (!current) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t("media.many")}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
            onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
            onTouchEnd={(event) => {
                const end = event.changedTouches[0]?.clientX;
                if (touchStart === null || end === undefined) return;
                const delta = end - touchStart;
                if (delta > SWIPE_PIXELS) previous();
                if (delta < -SWIPE_PIXELS) next();
                setTouchStart(null);
            }}
        >
            {/* The dark background is a button, so a click on it closes the window from the keyboard too. */}
            <button
                type="button"
                tabIndex={-1}
                aria-label={t("common.close")}
                className="absolute inset-0 cursor-default"
                onClick={onClose}
            />
            <div className="relative flex max-h-full max-w-full flex-col items-center gap-3">
                {/* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized for viewing */}
                <img
                    key={current.mediaId}
                    src={photoUrl(slug, current.mediaId, "medium")}
                    alt=""
                    className="max-h-[80dvh] max-w-[92vw] rounded-box object-contain"
                />
                <div className="flex items-center gap-3 text-sm text-white/90">
                    <span>{t("media.counter", { current: index + 1, total })}</span>
                    <a
                        href={photoUrl(slug, current.mediaId, "original")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                    >
                        {t("media.openOriginal")}
                    </a>
                </div>
            </div>

            <button
                type="button"
                className="btn btn-circle btn-ghost absolute top-4 right-4 text-white"
                aria-label={t("common.close")}
                onClick={onClose}
            >
                <X className="size-6" />
            </button>
            {total > 1 && (
                <>
                    <button
                        type="button"
                        className="btn btn-circle btn-ghost absolute top-1/2 left-3 -translate-y-1/2 text-white"
                        aria-label={t("media.previous")}
                        onClick={previous}
                    >
                        <ChevronLeft className="size-8" />
                    </button>
                    <button
                        type="button"
                        className="btn btn-circle btn-ghost absolute top-1/2 right-3 -translate-y-1/2 text-white"
                        aria-label={t("media.next")}
                        onClick={next}
                    >
                        <ChevronRight className="size-8" />
                    </button>
                </>
            )}
        </div>
    );
}
