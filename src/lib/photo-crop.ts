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
