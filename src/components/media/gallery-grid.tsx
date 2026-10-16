"use client";

/**
 * Familee - the gallery of a tree: every photograph of the archive in one grid.
 *
 * A click opens the shared window; under each picture the people it is attached to are named
 * and link to their cards.
 */

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Lightbox, photoUrl } from "@/components/media/lightbox";
import { Link } from "@/i18n/navigation";
import { formatDay } from "@/lib/day";

export type GalleryPhoto = {
    mediaId: string;
    /** The day the picture was taken, as "2007-04-21"; null when the file did not say. */
    takenStart: string | null;
    /** What is written under the picture, one entry per album that holds it. */
    captions: string[];
    /** Who is in the picture, by the name the tree gives them (the tags). */
    tagged: string[];
    /** The people the picture is attached to: the owner of the album, or the person of the event. */
    people: { personId: string; name: string }[];
    /** The events the photograph is attached to: their type and value, shown as captions. */
    events: { type: string; value: string | null }[];
};

export function GalleryGrid({ slug, photos }: { slug: string; photos: GalleryPhoto[] }) {
    const t = useTranslations();
    const locale = useLocale();
    const [viewing, setViewing] = useState<number | null>(null);

    return (
        <>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {photos.map((photo, index) => (
                    <li
                        key={photo.mediaId}
                        className="card card-border overflow-hidden bg-base-100"
                    >
                        <button
                            type="button"
                            onClick={() => setViewing(index)}
                            className="block aspect-square w-full overflow-hidden bg-base-200"
                        >
                            {/* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized as a thumbnail */}
                            <img
                                src={photoUrl(slug, photo.mediaId, "thumb")}
                                alt=""
                                loading="lazy"
                                className="size-full object-cover"
                            />
                        </button>
                        <div className="flex flex-col gap-1 p-2 text-xs">
                            {photo.takenStart && (
                                <span className="text-base-content/60">
                                    {formatDay(photo.takenStart, locale)}
                                </span>
                            )}
                            {photo.captions.map((caption) => (
                                <span key={caption} className="text-base-content/70">
                                    {caption}
                                </span>
                            ))}
                            {photo.tagged.length > 0 && (
                                <span className="truncate text-base-content/50">
                                    {t("media.taggedIn")}: {photo.tagged.join(", ")}
                                </span>
                            )}
                            {photo.people.length === 0 &&
                                photo.events.length === 0 &&
                                photo.tagged.length === 0 &&
                                photo.captions.length === 0 && (
                                    <span className="text-base-content/60">
                                        {t("gallery.unattached")}
                                    </span>
                                )}
                            {photo.people.map((person) => (
                                <Link
                                    key={person.personId}
                                    href={`/trees/${slug}/persons/${person.personId}`}
                                    className="link truncate"
                                >
                                    {person.name || t("common.unknown")}
                                </Link>
                            ))}
                            {photo.events.map((event) => (
                                <span
                                    key={`${event.type}:${event.value ?? ""}`}
                                    className="truncate text-base-content/70"
                                >
                                    {t(`events.${event.type}` as "events.birth")}
                                    {event.value ? ` · ${event.value}` : ""}
                                </span>
                            ))}
                        </div>
                    </li>
                ))}
            </ul>

            {viewing !== null && photos[viewing] && (
                <Lightbox
                    slug={slug}
                    photos={photos.map((photo) => ({
                        mediaId: photo.mediaId,
                        caption: photo.captions[0] ?? null,
                        tagged: photo.tagged,
                        date: photo.takenStart,
                    }))}
                    index={viewing}
                    onIndex={setViewing}
                    onClose={() => setViewing(null)}
                />
            )}
        </>
    );
}
