/**
 * Familee - the sources of a tree
 *
 * The library of sources, such as a census page or a letter. Every member reads them; editors add
 * and change them in the panel.
 */

import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SourcesPanel } from "@/components/library/sources-panel";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listSources } from "@/lib/library";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/** The sources of the tree: where the facts come from. */
export default async function SourcesPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/sources`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const sources = await listSources(access.treeId);
    const t = await getTranslations();

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("source.many")}</h1>
            </header>
            <SourcesPanel slug={slug} sources={sources} canEdit={atLeast(access.role, "editor")} />
        </div>
    );
}
