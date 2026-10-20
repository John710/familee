"use client";

/**
 * Familee - the mark of a file that is not a photograph
 *
 * A document, a recording and a film carry no picture of their own, so the album and the gallery
 * show a mark of their kind where a photograph shows its thumbnail. The kinds come from
 * src/lib/media-kind.ts.
 */

import { FileText, Film, Music, Paperclip } from "lucide-react";

export function MediaIcon({ kind, className }: { kind: string; className?: string }) {
    if (kind === "audio") return <Music className={className} />;
    if (kind === "video") return <Film className={className} />;
    if (kind === "document") return <FileText className={className} />;
    return <Paperclip className={className} />;
}
