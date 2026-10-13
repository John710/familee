"use client";

/**
 * Familee - the window that shows one photograph over the page and turns the album.
 *
 * Used by the person's album, by the photographs of an event and by the gallery of the tree.
 * The arrows (keys, buttons or a swipe on a phone) turn to the next and previous photo;
 * Escape, the close button or a click on the dark background closes the window. The
 * picture is shown in its medium size; the original opens from a link.
 */

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type Variant = "thumb" | "medium" | "original";

/** The address of a variant of a photograph, served by our own route to the tree's members. */
export function photoUrl(slug: string, mediaId: string, variant: Variant): string {
    return `/api/trees/${slug}/media/${mediaId}/${variant}`;
}

/** A horizontal swipe of this many pixels turns the page of the lightbox. */
const SWIPE_PIXELS = 50;

export function Lightbox({
    slug,
    photos,
    index,
    onIndex,
    onClose,
}: {
    slug: string;
    photos: { mediaId: string }[];
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
