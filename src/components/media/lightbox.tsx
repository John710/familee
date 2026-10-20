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
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { MediaIcon } from "@/components/media/media-icon";
import { formatDay } from "@/lib/day";
import { useFocusTrap } from "@/lib/focus-trap";

export type Variant = "thumb" | "medium" | "original";

/** The address of a variant of a file, served by our own route to the tree's members. */
export function photoUrl(slug: string, mediaId: string, variant: Variant): string {
    return `/api/trees/${slug}/media/${mediaId}/${variant}`;
}

/**
 * Everything that is not a photograph, in the window: a recording plays, a film plays, a PDF is
 * shown in the page, and anything else is offered as a file to open or save.
 */
function NonPhoto({
    kind,
    mimeType,
    src,
    name,
}: {
    kind: string;
    mimeType: string;
    src: string;
    name: string | null;
}) {
    const t = useTranslations();

    if (kind === "audio") {
        // biome-ignore lint/a11y/useMediaCaption: a family recording carries no captions
        return <audio controls src={src} className="w-[min(90vw,34rem)]" />;
    }
    if (kind === "video") {
        return (
            // biome-ignore lint/a11y/useMediaCaption: a family film carries no captions
            <video controls src={src} className="max-h-[80dvh] max-w-[92vw] rounded-box bg-black" />
        );
    }
    if (mimeType === "application/pdf") {
        return (
            <iframe
                title={name ?? t("media.file")}
                src={src}
                className="h-[80dvh] w-[92vw] rounded-box bg-white"
            />
        );
    }
    return (
        <div className="flex flex-col items-center gap-3 rounded-box bg-white/10 px-10 py-12 text-white">
            <MediaIcon kind={kind} className="size-16 text-white/70" />
            <p className="max-w-[70vw] truncate text-sm">{name ?? t("media.file")}</p>
            <a href={src} target="_blank" rel="noopener noreferrer" className="link">
                {t("media.openOriginal")}
            </a>
        </div>
    );
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
    /** The files of the album or the event, in the order shown; the window turns between them. */
    photos: {
        mediaId: string;
        /** photo · document · audio · video · other; a photograph when it is not given. */
        kind?: string;
        /** The type the archive serves it as, so the window knows how to show it. */
        mimeType?: string;
        /** The name the file came from, for a document the reader has to recognize. */
        name?: string | null;
        caption?: string | null;
        tagged?: string[];
        /** The day the picture was taken, as "2007-04-21", when it is known. */
        date?: string | null;
    }[];
    index: number;
    onIndex: (index: number) => void;
    onClose: () => void;
}) {
    const t = useTranslations();
    const locale = useLocale();
    const boxRef = useRef<HTMLDivElement>(null);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const total = photos.length;
    const current = photos[index];

    // The window is mounted only while it is open, so the keyboard stays inside it the whole time.
    useFocusTrap(boxRef, true);

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

    const kind = current.kind ?? "photo";
    const original = photoUrl(slug, current.mediaId, "original");

    return (
        <div
            ref={boxRef}
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
                {kind === "photo" ? (
                    /* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized for viewing */
                    <img
                        key={current.mediaId}
                        src={photoUrl(slug, current.mediaId, "medium")}
                        alt=""
                        className="max-h-[80dvh] max-w-[92vw] rounded-box object-contain"
                    />
                ) : (
                    <NonPhoto
                        kind={kind}
                        mimeType={current.mimeType ?? ""}
                        src={original}
                        name={current.name ?? null}
                    />
                )}
                <div className="flex flex-col items-center gap-1 text-sm text-white/90">
                    <div className="flex items-center gap-3">
                        <span>{t("media.counter", { current: index + 1, total })}</span>
                        {current.date && <span>{formatDay(current.date, locale)}</span>}
                        <a
                            href={original}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link"
                        >
                            {t("media.openOriginal")}
                        </a>
                    </div>
                    {current.caption && (
                        <p className="max-w-[80dvh] text-center text-white/80">{current.caption}</p>
                    )}
                    {(current.tagged?.length ?? 0) > 0 && (
                        <p className="text-white/60 text-xs">{current.tagged?.join(", ")}</p>
                    )}
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
