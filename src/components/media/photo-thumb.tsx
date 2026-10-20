"use client";

/**
 * Familee - a small picture that opens in the shared window when clicked.
 *
 * Used in the change history, where an entry names a file: a photograph is shown as a thumbnail,
 * and a document, a recording or a film as the mark of its kind. A click opens it over the page, as
 * everywhere else in the archive.
 */

import { useState } from "react";

import { Lightbox, photoUrl } from "@/components/media/lightbox";
import { MediaIcon } from "@/components/media/media-icon";

export function PhotoThumb({
    slug,
    mediaId,
    label,
    kind = "photo",
    mimeType = "image/webp",
    size = "size-12",
}: {
    slug: string;
    mediaId: string;
    label: string;
    /** photo · document · audio · video · other. */
    kind?: string;
    mimeType?: string;
    size?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={label}
                title={label}
                className={`inline-flex items-center justify-center overflow-hidden rounded-box border border-base-300 bg-base-200 align-middle text-base-content/60 ${size}`}
            >
                {kind === "photo" ? (
                    /* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized as a thumbnail */
                    <img
                        src={photoUrl(slug, mediaId, "thumb")}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                    />
                ) : (
                    <MediaIcon kind={kind} className="size-1/2" />
                )}
            </button>
            {open && (
                <Lightbox
                    slug={slug}
                    photos={[{ mediaId, kind, mimeType, name: label }]}
                    index={0}
                    onIndex={() => undefined}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}
