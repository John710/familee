import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PlacesPanel } from "@/components/library/places-panel";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listPlaces } from "@/lib/library";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/** The places of the tree: where people were born, lived and died. */
export default async function PlacesPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/places`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const places = await listPlaces(access.treeId);
    const t = await getTranslations();

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("place.many")}</h1>
            </header>
            <PlacesPanel slug={slug} places={places} canEdit={atLeast(access.role, "editor")} />
        </div>
    );
}
