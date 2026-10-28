/**
 * Familee - what a file that is dropped into the archive is
 *
 * The archive holds more than photographs: a scanned certificate, an interview recorded on a
 * telephone, a film of a wedding. The kind is decided here, from the file name and the type the
 * browser declared, and never taken from the request at face value: the mime type the archive
 * serves a file as is chosen by this table, so a file can never talk the browser into treating it
 * as something active.
 *
 * A photo (JPEG, PNG, WebP) goes through the picture pipeline (src/lib/photo-process.ts) and is
 * stored as three WebP variants. Everything else is kept byte for byte under its own extension and
 * served as it is, with the media players and the viewers doing the rest.
 *
 * Pure: no database, no filesystem, no environment. See tests/media-kind.test.ts.
 */

export type MediaKind = "photo" | "document" | "audio" | "video" | "other";

export type ClassifiedMedia = {
    kind: MediaKind;
    /** The type the archive serves it as. Chosen here, never copied from the request. */
    mimeType: string;
    /** A safe extension for the storage key, without the dot. */
    extension: string;
    /** The picture pipeline reads it; everything else is stored as it came. */
    processable: boolean;
};

type KindAndType = { kind: MediaKind; mimeType: string };

/** The extension the archive accepts for a name, lower-case letters and digits only. */
const EXTENSION = /^[a-z0-9]{1,8}$/;

/**
 * The table of the file types the archive knows by their extension. A type that is not here is
 * still stored - as "other" - so a .bak or a .woff is not refused, only kept without a viewer.
 */
const BY_EXTENSION: Record<string, KindAndType> = {
    // Photographs: the three the pipeline reads.
    jpg: { kind: "photo", mimeType: "image/jpeg" },
    jpeg: { kind: "photo", mimeType: "image/jpeg" },
    png: { kind: "photo", mimeType: "image/png" },
    webp: { kind: "photo", mimeType: "image/webp" },

    // Images the pipeline does not touch: kept as documents, shown as pictures or opened.
    gif: { kind: "document", mimeType: "image/gif" },
    bmp: { kind: "document", mimeType: "image/bmp" },
    tif: { kind: "document", mimeType: "image/tiff" },
    tiff: { kind: "document", mimeType: "image/tiff" },
    svg: { kind: "document", mimeType: "image/svg+xml" },
    heic: { kind: "document", mimeType: "image/heic" },

    // Documents.
    pdf: { kind: "document", mimeType: "application/pdf" },
    txt: { kind: "document", mimeType: "text/plain" },
    md: { kind: "document", mimeType: "text/markdown" },
    csv: { kind: "document", mimeType: "text/csv" },
    rtf: { kind: "document", mimeType: "application/rtf" },
    doc: { kind: "document", mimeType: "application/msword" },
    docx: {
        kind: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    odt: { kind: "document", mimeType: "application/vnd.oasis.opendocument.text" },
    epub: { kind: "document", mimeType: "application/epub+zip" },

    // Audio.
    mp3: { kind: "audio", mimeType: "audio/mpeg" },
    wav: { kind: "audio", mimeType: "audio/wav" },
    ogg: { kind: "audio", mimeType: "audio/ogg" },
    oga: { kind: "audio", mimeType: "audio/ogg" },
    opus: { kind: "audio", mimeType: "audio/opus" },
    m4a: { kind: "audio", mimeType: "audio/mp4" },
    aac: { kind: "audio", mimeType: "audio/aac" },
    flac: { kind: "audio", mimeType: "audio/flac" },

    // Video.
    mp4: { kind: "video", mimeType: "video/mp4" },
    m4v: { kind: "video", mimeType: "video/mp4" },
    webm: { kind: "video", mimeType: "video/webm" },
    mov: { kind: "video", mimeType: "video/quicktime" },
    mkv: { kind: "video", mimeType: "video/x-matroska" },
    avi: { kind: "video", mimeType: "video/x-msvideo" },
    ogv: { kind: "video", mimeType: "video/ogg" },

    // Archives and anything else: kept, offered for download.
    zip: { kind: "other", mimeType: "application/zip" },
    "7z": { kind: "other", mimeType: "application/x-7z-compressed" },
    rar: { kind: "other", mimeType: "application/vnd.rar" },
    tar: { kind: "other", mimeType: "application/x-tar" },
    gz: { kind: "other", mimeType: "application/gzip" },
};

/** The extension given to a file whose name does not carry a known one. */
const FALLBACK_EXTENSION = "bin";

const FALLBACK_TYPE = "application/octet-stream";

/** The lower-case extension of a file name, or null when it has none worth keeping. */
export function extensionOf(filename: string | null | undefined): string | null {
    if (!filename) return null;
    const dot = filename.lastIndexOf(".");
    if (dot < 0 || dot === filename.length - 1) return null;
    const extension = filename.slice(dot + 1).toLowerCase();
    return EXTENSION.test(extension) ? extension : null;
}

/**
 * The kind a declared mime type alone names, for a file whose extension is unknown. A picture the
 * pipeline cannot read (a GIF, an SVG) is a document here, so it is stored and linked rather than
 * refused.
 */
function kindFromMime(mimeType: string): MediaKind {
    const type = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
    if (type === "image/jpeg" || type === "image/png" || type === "image/webp") return "photo";
    if (type.startsWith("image/")) return "document";
    if (type.startsWith("audio/")) return "audio";
    if (type.startsWith("video/")) return "video";
    if (type === "application/pdf" || type.startsWith("text/")) return "document";
    return "other";
}

/**
 * What a dropped file is. The extension leads, the declared type settles the rest: a PDF named
 * "scan.bin" is still a document, and a "photo.jpg" that the browser calls application/octet-stream
 * is still a photograph.
 */
export function classifyMedia(
    declaredType: string | null | undefined,
    filename: string | null | undefined,
): ClassifiedMedia {
    const extension = extensionOf(filename);
    const known = extension ? BY_EXTENSION[extension] : undefined;
    const kind = known?.kind ?? kindFromMime(declaredType ?? "");

    let mimeType = known?.mimeType ?? FALLBACK_TYPE;
    if (!known && declaredType) {
        // A declared type is kept only when it agrees with the kind AND is on the allow-list: it
        // may name the exact flavour of an audio or a text file the table does not carry, but
        // text/javascript or text/html would run on the archive's own origin through <script src>.
        const declared = declaredType.toLowerCase().split(";")[0]?.trim() ?? "";
        if (kindFromMime(declared) === kind && isSafeDeclared(declared)) mimeType = declared;
    }

    const pathExtension = extension ?? extensionForMime(mimeType);

    return {
        kind,
        mimeType,
        extension: pathExtension,
        processable: kind === "photo",
    };
}

/** The declared types that cannot carry a script and so may be served as the browser named them. */
const SAFE_DECLARED = new Set([
    "application/pdf",
    "application/rtf",
    "text/plain",
    "text/csv",
    "text/markdown",
]);

/** Sound and film are played by the media elements, which never run what they are given. */
function isSafeDeclared(type: string): boolean {
    if (SAFE_DECLARED.has(type)) return true;
    return /^(audio|video)\/[a-z0-9][a-z0-9.+_-]*$/.test(type);
}

/** The extension for a known mime type, so a PDF without a name still ends in .pdf. */
function extensionForMime(mimeType: string): string {
    const found = Object.entries(BY_EXTENSION).find(([, value]) => value.mimeType === mimeType);
    return found?.[0] ?? FALLBACK_EXTENSION;
}

/** The types that are safe to open in the page: they cannot carry a script of their own. */
const INLINE_TYPES = new Set(["application/pdf", "text/plain", "text/csv", "text/markdown"]);

/**
 * Whether a file should be offered to the browser for viewing rather than for saving. Documents,
 * sound and film open in the page; an archive or an unknown file is downloaded instead, so the
 * browser never guesses what to do with it.
 *
 * SVG and HTML are deliberately NOT inline: both can carry a script, and served from the address
 * of the archive they would run beside its pages. They are downloaded as files instead. The route
 * also sends `nosniff`, so a browser cannot decide for itself that a download is really a page.
 */
export function inlineable(mimeType: string): boolean {
    const type = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
    if (INLINE_TYPES.has(type)) return true;
    if (type === "image/svg+xml" || type === "application/xhtml+xml") return false;
    if (type.startsWith("image/")) return true;
    if (type.startsWith("audio/") || type.startsWith("video/")) return true;
    return false;
}
