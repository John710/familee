import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GalleryGrid, type GalleryPhoto } from "@/components/media/gallery-grid";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listPersonCards } from "@/lib/people";
import { listPersonAlbum, listPhotoPeople } from "@/lib/photos";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string; personId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person's album: their photographs and the photographs of their events. */
export default async function PersonAlbumPage({ params }: { params: Promise<Params> }) {
    const { locale, slug, personId } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    if (!UUID.test(personId)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/gallery/${personId}`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const people = await listPersonCards(access.treeId);
    const person = people.find((candidate) => candidate.personId === personId);
    if (!person) notFound();

    const t = await getTranslations();
    const name = person.fullName || t("common.unknown");
    const owner = [{ personId, name }];

    // A photograph can be in the album twice (as the person's and under an event): one entry, both captions.
    const items = await listPersonAlbum(access.treeId, personId);
    const tags = await listPhotoPeople(
        access.treeId,
        items.map((item) => item.mediaId),
    );
    const byMedia = new Map<string, GalleryPhoto>();
    for (const item of items) {
        const photo = byMedia.get(item.mediaId) ?? {
            mediaId: item.mediaId,
            kind: item.kind,
            mimeType: item.mimeType,
            name: item.originalFilename,
            takenStart: item.takenStart,
            captions: [],
            tagged: (tags.get(item.mediaId) ?? []).flatMap((person) =>
                person.name ? [person.name] : [],
            ),
            people: owner,
            events: [],
        };
        if (item.caption && !photo.captions.includes(item.caption)) {
            photo.captions.push(item.caption);
        }
        if (item.eventType) {
            photo.events = [...photo.events, { type: item.eventType, value: item.eventValue }];
        }
        byMedia.set(item.mediaId, photo);
    }
    const photos = [...byMedia.values()];

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/gallery`} className="text-primary text-sm">
                    {t("gallery.title")}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{name}</h1>
                <Link href={`/trees/${slug}/persons/${personId}`} className="link text-sm">
                    {t("gallery.openCard")}
                </Link>
            </header>

            {photos.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("gallery.personEmpty")}</p>
            ) : (
                <GalleryGrid slug={slug} photos={photos} />
            )}
        </div>
    );
}
