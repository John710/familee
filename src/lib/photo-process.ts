/**
 * Familee - turning an uploaded photograph into the files the archive keeps
 *
 * sharp reads the picture itself (the file name and the declared type are not trusted),
 * turns it upright according to its orientation tag, and writes three WebP variants:
 * a thumbnail for the tree and the album, a medium size for viewing, and the original
 * re-encoded. Metadata is dropped on purpose: GPS positions and camera serial numbers
 * stay out of the archive.
 */

import { createHash } from "node:crypto";

import sharp from "sharp";

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const THUMB_SIDE = 320;
const MEDIUM_SIDE = 1200;
/** The largest side the WebP format can hold. */
const WEBP_MAX_SIDE = 16383;

export type ProcessedPhoto = {
    checksum: string;
    width: number;
    height: number;
    variants: Record<
        "thumb" | "medium" | "original",
        { data: Buffer; width: number; height: number }
    >;
};

export type ProcessResult =
    | { ok: true; photo: ProcessedPhoto }
    | { ok: false; error: "media.errors.unsupported" | "media.errors.failed" };

export async function processPhoto(source: Buffer): Promise<ProcessResult> {
    let format: string | undefined;
    try {
        format = (await sharp(source, { limitInputPixels: 80_000_000 }).metadata()).format;
    } catch {
        return { ok: false, error: "media.errors.failed" };
    }
    if (!format || !ACCEPTED_FORMATS.has(format)) {
        return { ok: false, error: "media.errors.unsupported" };
    }

    try {
        const upright = () => sharp(source, { limitInputPixels: 80_000_000 }).rotate();

        // WebP cannot be wider or taller than 16383 px; a larger scan is scaled down to fit that
        // (keeping its proportions) instead of failing as a generic error after the pixel check.
        const original = await upright()
            .resize(WEBP_MAX_SIDE, WEBP_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 90 })
            .toBuffer({ resolveWithObject: true });
        const medium = await upright()
            .resize(MEDIUM_SIDE, MEDIUM_SIDE, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer({ resolveWithObject: true });
        const thumb = await upright()
            .resize(THUMB_SIDE, THUMB_SIDE, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer({ resolveWithObject: true });

        return {
            ok: true,
            photo: {
                checksum: createHash("sha256").update(source).digest("hex"),
                width: original.info.width,
                height: original.info.height,
                variants: {
                    thumb: { data: thumb.data, width: thumb.info.width, height: thumb.info.height },
                    medium: {
                        data: medium.data,
                        width: medium.info.width,
                        height: medium.info.height,
                    },
                    original: {
                        data: original.data,
                        width: original.info.width,
                        height: original.info.height,
                    },
                },
            },
        };
    } catch {
        return { ok: false, error: "media.errors.failed" };
    }
}
