/**
 * Familee - the page that imports a GEDCOM file into a tree
 *
 * For editors and above. The file is read and previewed here; nothing is written until the person
 * confirms the preview. The import itself is in src/lib/gedcom-import.ts.
 */

import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GedcomImportForm } from "@/components/trees/gedcom-import-form";
import { routing } from "@/i18n/routing";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

export default async function ImportPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/import`);
    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role, "editor")) notFound();

    const t = await getTranslations();

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <span className="text-primary text-sm">{access.title}</span>
                <h1 className="font-semibold font-serif text-3xl">{t("gedcom.import")}</h1>
                <p className="text-base-content/60 text-sm">{t("gedcom.importHint")}</p>
            </header>
            <GedcomImportForm slug={slug} personsHref={`/trees/${slug}/persons`} />
        </div>
    );
}
