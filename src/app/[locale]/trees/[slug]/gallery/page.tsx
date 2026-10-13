import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GalleryGrid, type GalleryPhoto } from "@/components/media/gallery-grid";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listTreePhotos } from "@/lib/photos";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

export default async function GalleryPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/gallery`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const rows = await listTreePhotos(access.treeId);
    const photos: GalleryPhoto[] = rows.map((row) => {
        const people = new Map<string, { personId: string; name: string }>();
        for (const link of row.links) {
            if (link.personId) {
                people.set(link.personId, {
                    personId: link.personId,
                    name: link.personName ?? "",
                });
            }
        }
        return {
            mediaId: row.mediaId,
            people: [...people.values()],
            eventCount: row.links.filter((link) => link.eventId !== null).length,
        };
    });

    const t = await getTranslations();

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("gallery.title")}</h1>
                <p className="text-base-content/60 text-sm">{t("gallery.hint")}</p>
            </header>

            {photos.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("gallery.empty")}</p>
            ) : (
                <GalleryGrid slug={slug} photos={photos} />
            )}
        </div>
    );
}
