"use client";

/**
 * Familee - a small picture that opens in the shared window when clicked.
 *
 * Used in the change history, where an entry names a photograph: the picture is shown as a
 * thumbnail, and a click opens it over the page, as everywhere else in the archive.
 */

import { useState } from "react";

import { Lightbox, photoUrl } from "@/components/media/lightbox";

export function PhotoThumb({
    slug,
    mediaId,
    label,
    size = "size-12",
}: {
    slug: string;
    mediaId: string;
    label: string;
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
                className={`inline-block overflow-hidden rounded-box border border-base-300 bg-base-200 align-middle ${size}`}
            >
                {/* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized as a thumbnail */}
                <img
                    src={photoUrl(slug, mediaId, "thumb")}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                />
            </button>
            {open && (
                <Lightbox
                    slug={slug}
                    photos={[{ mediaId }]}
                    index={0}
                    onIndex={() => undefined}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}
