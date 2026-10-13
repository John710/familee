import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listPersonCards } from "@/lib/people";
import { cropStyle, type PhotoCrop } from "@/lib/photo-crop";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/**
 * The gallery is a set of albums: one card per person. The card shows the person's main
 * photograph, or a silhouette when there is none; a click opens the person's album.
 */
export default async function GalleryPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/gallery`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    // Only people with a main photograph get an album card; the others have nothing to show here.
    const people = (await listPersonCards(access.treeId)).filter(
        (person) => person.portraitMediaId !== null,
    );
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

            {people.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("gallery.empty")}</p>
            ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {people.map((person) => {
                        const name = person.fullName || t("common.unknown");
                        const photoUrl = `/api/trees/${slug}/media/${person.portraitMediaId}/thumb`;
                        const crop: PhotoCrop | null =
                            person.cropX === null ||
                            person.cropY === null ||
                            person.cropW === null ||
                            person.cropH === null
                                ? null
                                : {
                                      x: person.cropX,
                                      y: person.cropY,
                                      w: person.cropW,
                                      h: person.cropH,
                                  };
                        const ratio =
                            person.portraitWidth && person.portraitHeight
                                ? person.portraitHeight / person.portraitWidth
                                : null;
                        return (
                            <li key={person.personId}>
                                <Link
                                    href={`/trees/${slug}/gallery/${person.personId}`}
                                    className="card card-border block overflow-hidden bg-base-100 transition hover:shadow-md"
                                >
                                    <span
                                        className="relative block aspect-square overflow-hidden bg-base-200"
                                        style={crop ? { containerType: "size" } : undefined}
                                    >
                                        {/* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized as a thumbnail */}
                                        <img
                                            src={photoUrl}
                                            alt=""
                                            loading="lazy"
                                            className={
                                                crop
                                                    ? "absolute max-w-none"
                                                    : "size-full object-cover"
                                            }
                                            style={cropStyle(crop, ratio)}
                                        />
                                    </span>
                                    <span className="flex flex-col gap-0.5 p-3">
                                        <span className="truncate font-medium text-sm">{name}</span>
                                        <span className="text-base-content/60 text-xs">
                                            {t("gallery.albumLink")}
                                        </span>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
