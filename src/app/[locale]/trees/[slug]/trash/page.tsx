import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TrashList } from "@/components/persons/trash-list";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listTrashedPersons } from "@/lib/deletion";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/**
 * The trash of one tree. Only those who may move a person out of the tree see it; the permanent
 * deletion is offered to the owner and the administrators.
 */
export default async function TrashPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/trash`);
    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role, "editor")) notFound();

    const rows = await listTrashedPersons(access.treeId);
    const t = await getTranslations();
    const whenFormat = new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "UTC",
    });

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/persons`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("trash.title")}</h1>
                <p className="text-base-content/60 text-sm">{t("trash.hint")}</p>
            </header>

            <TrashList
                slug={slug}
                canPurge={atLeast(access.role, "admin")}
                rows={rows.map((row) => ({
                    personId: row.personId,
                    name: row.name ?? "",
                    when: row.deletedAt ? whenFormat.format(row.deletedAt) : "",
                    by: row.deletedByName ?? "",
                }))}
            />
        </div>
    );
}
