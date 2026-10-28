/**
 * Familee - the page of the records that look impossible
 *
 * Lists the problems the data check finds in the tree, each with a link to the card concerned
 * (the rules are in src/lib/data-checks.ts). Nothing is changed here: the page only points at the
 * records that deserve a second look.
 */

import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listDataProblems } from "@/lib/checks";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/**
 * The doubtful places of one tree: a death before a birth, a child born before a parent, a mother
 * of nine, a life of a hundred and thirty years, a date that has not happened, a marriage before a
 * partner was born, two births on one person.
 *
 * Nothing is changed here: the page only points, calmy, at the records that deserve a second look,
 * and links to them. Everybody who may read the tree may read this.
 */
export default async function ChecksPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/checks`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const report = await listDataProblems(access.treeId);
    const t = await getTranslations();

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("checks.title")}</h1>
                <p className="text-base-content/60 text-sm">{t("checks.hint")}</p>
            </header>

            {report.issues.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("checks.empty")}</p>
            ) : (
                <>
                    <p className="text-base-content/70 text-sm">
                        {t("checks.found", { count: report.issues.length })}
                    </p>
                    <ul className="flex flex-col gap-2">
                        {report.issues.map((issue, index) => (
                            <li
                                // biome-ignore lint/suspicious/noArrayIndexKey: the same remark can name the same people twice; the position keeps the key unique
                                key={`${issue.code}-${issue.personIds.join("-")}-${index}`}
                                className="flex items-start gap-3 rounded-box border border-warning/40 bg-warning/5 p-3"
                            >
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                                <div className="flex min-w-0 flex-col gap-1">
                                    <span className="text-sm">
                                        {t(
                                            `checks.issues.${issue.code}` as "checks.issues.birthAfterDeath",
                                            issue.params,
                                        )}
                                    </span>
                                    <span className="flex flex-wrap items-center gap-x-2 text-xs">
                                        {issue.personIds.map((personId) => (
                                            <Link
                                                key={personId}
                                                href={`/trees/${slug}/persons/${personId}`}
                                                className="link"
                                            >
                                                {report.names.get(personId) || t("common.unknown")}
                                            </Link>
                                        ))}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
