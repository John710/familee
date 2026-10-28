/**
 * Familee - the part of a photograph that a card shows
 *
 * A crop is four fractions of the picture (x, y, w, h), stored on the person's link to it.
 * The card is a square, so a crop is a square in pixels: its height as a fraction is its width
 * divided by the picture's ratio (height over width). The style below places the picture in a
 * square container so that the crop fills it; it uses the container's own units (cqw), so the
 * same code gives the same look on a card and in the editor's preview.
 */

import type { CSSProperties } from "react";

export type PhotoCrop = { x: number; y: number; w: number; h: number };

/** The largest width a crop can have: it cannot be wider than the picture or taller than it. */
export function maxCropWidth(ratio: number): number {
    return Math.min(1, ratio);
}

/** The height a square crop of the given width takes, as a fraction of the picture. */
export function cropHeight(width: number, ratio: number): number {
    return width / ratio;
}

/** A square crop centred in the picture, at most 80% of its largest size. */
export function defaultCrop(ratio: number): PhotoCrop {
    const w = maxCropWidth(ratio) * 0.8;
    const h = cropHeight(w, ratio);
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** The style that shows the crop in a square container with `container-type: size`. */
export function cropStyle(crop: PhotoCrop | null, ratio: number | null): CSSProperties | undefined {
    if (!crop || ratio === null) return undefined;
    const scale = `calc(100cqw / ${crop.w})`;
    return {
        width: scale,
        height: "auto",
        left: `calc(-${crop.x} * ${scale})`,
        top: `calc(-${crop.y} * ${scale} * ${ratio})`,
    };
}

/** The columns are numeric(6,5): five decimals, counted here as whole units to avoid float sums. */
const UNITS = 100000;

/** What the editor's rounding may overshoot by before a crop is refused: 0.0001 of the picture. */
const TOLERANCE_UNITS = 10;

/**
 * A crop as the database will store it, or null when it cannot be one. Each value is rounded to the
 * five decimals of the column, and the width and height are pulled back so that x + w and y + h
 * never exceed 1 after the rounding: the CHECK of media_links is exact, while the editor's floating
 * point is not. A crop that overshoots by more than the tolerance is refused, not trimmed.
 */
export function normalizeCrop(crop: PhotoCrop): PhotoCrop | null {
    const values = [crop.x, crop.y, crop.w, crop.h];
    if (!values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return null;

    const x = Math.round(crop.x * UNITS);
    const y = Math.round(crop.y * UNITS);
    let w = Math.round(crop.w * UNITS);
    let h = Math.round(crop.h * UNITS);
    if (x + w > UNITS + TOLERANCE_UNITS || y + h > UNITS + TOLERANCE_UNITS) return null;

    w = Math.min(w, UNITS - x);
    h = Math.min(h, UNITS - y);
    if (w <= 0 || h <= 0) return null;
    return { x: x / UNITS, y: y / UNITS, w: w / UNITS, h: h / UNITS };
}
