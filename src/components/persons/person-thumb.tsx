/**
 * Familee - the small round picture of a person in the lists of birthdays.
 *
 * Shows the portrait when the person has one, otherwise a placeholder icon. It is plain markup
 * without state, so the server pages and the client menu can both use it.
 */

import { UserRound } from "lucide-react";

export function PersonThumb({ name, photoUrl }: { name: string; photoUrl: string | null }) {
    return (
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-base-200 text-base-content/40">
            {photoUrl ? (
                // biome-ignore lint/performance/noImgElement: the picture comes from our own route, already sized as a thumbnail
                <img src={photoUrl} alt={name} loading="lazy" className="size-full object-cover" />
            ) : (
                <UserRound className="size-5" aria-hidden="true" />
            )}
        </span>
    );
}
