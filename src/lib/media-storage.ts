/**
 * Familee - where the photograph files live
 *
 * The files sit in MEDIA_ROOT (the familee_media volume); the database keeps only their
 * keys. A key is built here from the tree, a storage digest and the variant, and it is checked
 * against a strict pattern before any path is made from it, so a key can never point
 * outside the volume.
 */

import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type MediaVariantName = "thumb" | "medium" | "original";

/**
 * A key: the tree's folder, two shards of the digest, the digest itself, the variant and the
 * extension. The extension is a short lower-case word - "webp" for a picture, "pdf", "mp3" or "bin"
 * for anything else - so a key can never carry a path or a surprise.
 */
const KEY_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}-(thumb|medium|large|small|original)\.[a-z0-9]{1,8}$/;

export function mediaRoot(): string {
    return process.env.MEDIA_ROOT ?? "/data/media";
}

/** The folder of one stored file: the tree, then two shards of its digest. */
function folderFor(treeId: string, digest: string): string {
    return `${treeId}/${digest.slice(0, 2)}/${digest.slice(2, 4)}`;
}

/** The keys of the three variants of one photograph, all in the same folder. */
export function variantKeys(treeId: string, checksum: string): Record<MediaVariantName, string> {
    const folder = folderFor(treeId, checksum);
    return {
        thumb: `${folder}/${checksum}-thumb.webp`,
        medium: `${folder}/${checksum}-medium.webp`,
        original: `${folder}/${checksum}-original.webp`,
    };
}

/**
 * The key of a file that is kept as it came - a document, a recording, a film, an archive. There is
 * one variant ("original", the bytes the reader uploaded) and the extension is the one the kind
 * table chose, never the one the browser declared.
 */
export function binaryKey(treeId: string, digest: string, extension: string): string {
    if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new Error("invalid media extension");
    return `${folderFor(treeId, digest)}/${digest}-original.${extension}`;
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

/** The size of a stored file, or null when it is not there. */
export async function mediaFileSize(key: string): Promise<number | null> {
    try {
        return (await stat(filePath(key))).size;
    } catch {
        return null;
    }
}

/**
 * Opens a stored file for reading, or a byte range of it. The file is streamed from the volume,
 * never read whole into memory: a film is handed to the player as it is read, and a range request
 * costs one seek instead of a copy of the file.
 */
export function openMediaFile(
    key: string,
    range?: { start: number; end: number },
): ReturnType<typeof createReadStream> | null {
    try {
        return createReadStream(filePath(key), range ?? { start: 0 });
    } catch {
        return null;
    }
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
