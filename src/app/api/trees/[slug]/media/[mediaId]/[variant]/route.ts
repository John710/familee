/**
 * Familee - showing a file of the archive
 *
 * The files are not public: the route gives a photograph, a document, a recording or a film to the
 * members of the tree it belongs to, and to nobody else. Anybody else gets the same 404 as for a
 * tree that does not exist.
 *
 * A photograph is served as one of its WebP variants. Everything else is served as its own bytes,
 * under the type the archive chose for it (never the one a browser declared), and a Range request
 * is honoured so that a player can start at once and seek without fetching the whole file.
 */

import { Readable } from "node:stream";

import { contentRange, parseByteRange } from "@/lib/http-range";
import { inlineable } from "@/lib/media-kind";
import { type MediaVariantName, mediaFileSize, openMediaFile } from "@/lib/media-storage";
import { findMediaFile } from "@/lib/photos";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

const VARIANTS: readonly MediaVariantName[] = ["thumb", "medium", "original"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filenameHeader(name: string | null): string {
    if (!name) return "";
    // The name comes from the uploader; it is sent as an RFC 5987 value so nothing has to be escaped
    // by hand and a non-latin name arrives whole.
    return `; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string; mediaId: string; variant: string }> },
) {
    const { slug, mediaId, variant } = await params;

    const user = await getCurrentUser();
    if (!user) return new Response("Sign in first", { status: 401 });

    const access = await getTreeAccess(slug, user.id);
    if (!access) return new Response("Not found", { status: 404 });

    // Both parts come from the address: they are checked before they reach the database.
    if (!(VARIANTS as readonly string[]).includes(variant) || !UUID.test(mediaId)) {
        return new Response("Not found", { status: 404 });
    }

    const file = await findMediaFile(access.treeId, mediaId, variant as MediaVariantName);
    if (!file) return new Response("Not found", { status: 404 });

    const headers = new Headers({
        "Content-Type": file.mimeType,
        // The type above is ours; a browser must not decide for itself that a download is a page.
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        "Content-Disposition":
            (inlineable(file.mimeType) ? "inline" : "attachment") + filenameHeader(file.filename),
        "Cache-Control": "private, max-age=3600",
    });

    // The size of the file on the volume is the truth, not the number the row remembers: a range is
    // measured against what is actually there.
    const size = await mediaFileSize(file.key);
    if (size === null) return new Response("Not found", { status: 404 });

    const range = parseByteRange(request.headers.get("range"), size);
    if (range.kind === "unsatisfiable") {
        headers.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
    }

    const stream = openMediaFile(
        file.key,
        range.kind === "range" ? { start: range.start, end: range.end } : undefined,
    );
    if (!stream) return new Response("Not found", { status: 404 });

    if (range.kind === "range") {
        headers.set("Content-Range", contentRange({ start: range.start, end: range.end }, size));
        headers.set("Content-Length", String(range.end - range.start + 1));
        return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
    }

    headers.set("Content-Length", String(size));
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers });
}
