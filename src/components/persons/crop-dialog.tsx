"use client";

/**
 * Familee - choosing the part of the main photograph that the card shows.
 *
 * A square frame lies over the picture: drag it to move, use the slider to change its size.
 * The frame is always a square in the picture's own proportions, the shape of the card. The
 * preview on the right is drawn with the same code as the card. Saving stores the crop on the
 * person's link to the photograph; "Reset" shows the whole picture again.
 */

import { useTranslations } from "next-intl";
import { type PointerEvent as ReactPointerEvent, useRef, useState, useTransition } from "react";

import { photoUrl } from "@/components/media/lightbox";
import { useRouter } from "@/i18n/navigation";
import { setPortraitCropAction } from "@/lib/actions/photos";
import { cropHeight, cropStyle, defaultCrop, maxCropWidth, type PhotoCrop } from "@/lib/photo-crop";

const MIN_WIDTH = 0.1;

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

export function CropDialog({
    slug,
    personId,
    mediaId,
    ratio,
    crop,
    onClose,
}: {
    slug: string;
    personId: string;
    mediaId: string;
    /** Height over width of the picture. */
    ratio: number;
    crop: PhotoCrop | null;
    onClose: () => void;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [rect, setRect] = useState<PhotoCrop>(crop ?? defaultCrop(ratio));
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const pictureRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointerX: number; pointerY: number; start: PhotoCrop } | null>(null);

    const maxWidth = maxCropWidth(ratio);

    function setWidth(width: number) {
        const w = clamp(width, MIN_WIDTH, maxWidth);
        const h = cropHeight(w, ratio);
        setRect((current) => ({
            x: clamp(current.x, 0, 1 - w),
            y: clamp(current.y, 0, 1 - h),
            w,
            h,
        }));
    }

    function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerX: event.clientX, pointerY: event.clientY, start: rect };
    }

    function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const current = drag.current;
        const picture = pictureRef.current;
        if (!current || !picture) return;
        const box = picture.getBoundingClientRect();
        const dx = (event.clientX - current.pointerX) / box.width;
        const dy = (event.clientY - current.pointerY) / box.height;
        setRect({
            x: clamp(current.start.x + dx, 0, 1 - current.start.w),
            y: clamp(current.start.y + dy, 0, 1 - current.start.h),
            w: current.start.w,
            h: current.start.h,
        });
    }

    function endDrag() {
        drag.current = null;
    }

    function save(next: PhotoCrop | null) {
        setError(null);
        startTransition(async () => {
            const result = await setPortraitCropAction({
                slug,
                personId,
                mediaId,
                crop: next,
            });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
            onClose();
        });
    }

    return (
        <div
            className="modal modal-open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-title"
        >
            <div className="modal-box flex max-w-4xl flex-col gap-5">
                <div className="flex flex-col gap-1">
                    <h2 id="crop-title" className="font-semibold text-lg">
                        {t("media.cropTitle")}
                    </h2>
                    <p className="text-base-content/60 text-sm">{t("media.cropHint")}</p>
                </div>

                <div className="grid gap-6 md:grid-cols-[1fr_auto]">
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-center rounded-box bg-base-200 p-2">
                            <div ref={pictureRef} className="relative inline-block select-none">
                                {/* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized for viewing */}
                                <img
                                    src={photoUrl(slug, mediaId, "medium")}
                                    alt=""
                                    draggable={false}
                                    className="block max-h-[55dvh] max-w-full"
                                />
                                <div
                                    role="presentation"
                                    onPointerDown={onPointerDown}
                                    onPointerMove={onPointerMove}
                                    onPointerUp={endDrag}
                                    onPointerCancel={endDrag}
                                    className="absolute cursor-move border-2 border-white"
                                    style={{
                                        left: `${rect.x * 100}%`,
                                        top: `${rect.y * 100}%`,
                                        width: `${rect.w * 100}%`,
                                        height: `${rect.h * 100}%`,
                                        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
                                        touchAction: "none",
                                    }}
                                />
                            </div>
                        </div>

                        <label className="flex items-center gap-3 text-sm">
                            <span className="shrink-0">{t("media.cropSize")}</span>
                            <input
                                type="range"
                                className="range range-sm"
                                min={MIN_WIDTH}
                                max={maxWidth}
                                step={0.01}
                                value={rect.w}
                                onChange={(event) => setWidth(Number(event.target.value))}
                            />
                        </label>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <span className="text-base-content/60 text-xs">
                            {t("media.cropPreview")}
                        </span>
                        <div
                            className="person-card relative size-28 overflow-hidden"
                            style={{ containerType: "size" }}
                        >
                            {/* biome-ignore lint/performance/noImgElement: the same picture as on the card, cut the same way */}
                            <img
                                src={photoUrl(slug, mediaId, "thumb")}
                                alt=""
                                className="absolute max-w-none"
                                style={cropStyle(rect, ratio)}
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <p role="alert" className="text-error text-sm">
                        {error}
                    </p>
                )}

                <div className="modal-action">
                    {crop && (
                        <button
                            type="button"
                            className="btn btn-ghost mr-auto"
                            disabled={pending}
                            onClick={() => save(null)}
                        >
                            {t("media.cropReset")}
                        </button>
                    )}
                    <button type="button" className="btn btn-ghost" onClick={onClose}>
                        {t("common.cancel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={pending}
                        onClick={() => save(rect)}
                    >
                        {t("media.cropSave")}
                    </button>
                </div>
            </div>
        </div>
    );
}
