"use client";

/**
 * Familee - choosing the part of the main photograph that the card shows.
 *
 * A square frame lies over the picture: drag it or use the arrow keys to move it (Shift for a
 * larger step), use the slider to change its size.
 * The frame is always a square in the picture's own proportions, the shape of the card. The
 * preview on the right is drawn with the same code as the card. Saving stores the crop on the
 * person's link to the photograph; "Reset" shows the whole picture again.
 */

import { useTranslations } from "next-intl";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useRef,
    useState,
    useTransition,
} from "react";

import { photoUrl } from "@/components/media/lightbox";
import { useRouter } from "@/i18n/navigation";
import { setPortraitCropAction } from "@/lib/actions/photos";
import { useEscapeLayer, useFocusTrap } from "@/lib/focus-trap";
import { cropHeight, cropStyle, defaultCrop, maxCropWidth, type PhotoCrop } from "@/lib/photo-crop";

const MIN_WIDTH = 0.1;

/** How far an arrow key moves the frame, as a share of the picture; Shift takes the larger step. */
const KEY_STEP = 0.01;
const KEY_STEP_LARGE = 0.05;

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
    const [saved, setSaved] = useState(false);
    const [pending, startTransition] = useTransition();
    const pictureRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointerX: number; pointerY: number; start: PhotoCrop } | null>(null);

    // The window is mounted only while it is open, so the keyboard stays inside it the whole time.
    useFocusTrap(boxRef, true);

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

    // The arrow keys move the frame by one percent of the picture, with Shift by five.
    function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        const move: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        };
        const delta = move[event.key];
        if (!delta) return;
        const [dx, dy] = delta;
        event.preventDefault();
        setRect((current) => ({
            ...current,
            x: clamp(current.x + dx, 0, 1 - current.w),
            y: clamp(current.y + dy, 0, 1 - current.h),
        }));
    }

    function save(next: PhotoCrop | null) {
        setError(null);
        setSaved(false);
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
            // The window stays open with the confirmation; the card behind is refreshed now.
            setSaved(true);
            router.refresh();
        });
    }

    // Escape closes the window, as it does everywhere else in the archive.
    useEscapeLayer(true, onClose);

    return (
        <div
            className="modal modal-open"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-title"
        >
            <div
                ref={boxRef}
                className="modal-box flex max-h-[92dvh] max-w-4xl flex-col gap-5 overflow-y-auto"
            >
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
                                    className="block max-h-[45dvh] max-w-full"
                                />
                                {/* A two-dimensional "slider": the arrow keys move it, as a drag does. */}
                                <div
                                    role="slider"
                                    tabIndex={0}
                                    aria-label={t("media.cropFrame")}
                                    aria-orientation="horizontal"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.round(rect.x * 100)}
                                    aria-valuetext={t("media.cropFramePosition", {
                                        x: Math.round(rect.x * 100),
                                        y: Math.round(rect.y * 100),
                                    })}
                                    onKeyDown={onKeyDown}
                                    onPointerDown={onPointerDown}
                                    onPointerMove={onPointerMove}
                                    onPointerUp={endDrag}
                                    onPointerCancel={endDrag}
                                    className="absolute cursor-move border-2 border-white focus-visible:outline-3 focus-visible:outline-warning focus-visible:outline-offset-2"
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

                {saved && (
                    <p role="status" className="alert alert-success py-2 text-sm">
                        {t("media.cropSaved")}
                    </p>
                )}

                <div className="modal-action sticky bottom-0 mt-0 bg-base-100 pt-3">
                    {saved ? (
                        <button type="button" className="btn btn-primary" onClick={onClose}>
                            {t("common.close")}
                        </button>
                    ) : (
                        <>
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
                                {pending ? t("common.saving") : t("media.cropSave")}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
