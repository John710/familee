/**
 * Familee - where the photograph files live
 *
 * The files sit in MEDIA_ROOT (the familee_media volume); the database keeps only their
 * keys. A key is built here from the tree, the checksum and the variant, and it is checked
 * against a strict pattern before any path is made from it, so a key can never point
 * outside the volume.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type MediaVariantName = "thumb" | "medium" | "original";

const KEY_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}-(thumb|medium|original)\.webp$/;

export function mediaRoot(): string {
    return process.env.MEDIA_ROOT ?? "/data/media";
}

/** The keys of the three variants of one photograph, all in the same folder. */
export function variantKeys(treeId: string, checksum: string): Record<MediaVariantName, string> {
    const folder = `${treeId}/${checksum.slice(0, 2)}/${checksum.slice(2, 4)}`;
    return {
        thumb: `${folder}/${checksum}-thumb.webp`,
        medium: `${folder}/${checksum}-medium.webp`,
        original: `${folder}/${checksum}-original.webp`,
    };
}

function filePath(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("invalid media key");
    // The root comes from MEDIA_ROOT at run time, not from the code: the magic comment stops the
    // bundler from tracing the whole project as if the path were a source file.
    return path.join(/* turbopackIgnore: true */ mediaRoot(), ...key.split("/"));
}

export async function writeMediaFile(key: string, data: Buffer): Promise<void> {
    const target = filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
}

export async function readMediaFile(key: string): Promise<Buffer> {
    return readFile(filePath(key));
}

/** Removes files that may already be gone: a missing file is not an error here. */
export async function removeMediaFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(filePath(key), { force: true }).catch(() => undefined)));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Removes the whole folder of one tree: every photograph and variant of it. The folder is named
 * by the tree's id, which is checked as a UUID first, so the path cannot point outside the volume.
 */
export async function removeTreeFiles(treeId: string): Promise<void> {
    if (!UUID.test(treeId)) throw new Error("invalid tree id");
    await rm(path.join(/* turbopackIgnore: true */ mediaRoot(), treeId), {
        recursive: true,
        force: true,
    });
}
