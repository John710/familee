import { Search } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { formatDay } from "@/lib/day";
import { type SearchHit, searchHitHref, searchTree } from "@/lib/library";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

const KINDS: SearchHit["kind"][] = ["person", "photo", "place", "source", "note", "event"];

export default async function SearchPage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<{ q?: string }>;
}) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/search`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const { q = "" } = await searchParams;
    const query = q.trim();
    const hits = await searchTree(access.treeId, query);
    const t = await getTranslations();

    // The day of a photograph is stored as "2007-04-21" and reads as "21 April 2007".
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const detailOf = (hit: SearchHit) =>
        hit.kind === "photo" && DAY.test(hit.detail) ? formatDay(hit.detail, locale) : hit.detail;

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("search.title")}</h1>
            </header>

            <form method="get" className="flex max-w-xl items-center gap-2">
                <div className="input flex w-full items-center gap-2">
                    <Search className="size-4 text-base-content/60" aria-hidden="true" />
                    <input
                        type="search"
                        name="q"
                        defaultValue={query}
                        placeholder={t("search.placeholder")}
                        aria-label={t("search.placeholder")}
                        className="w-full bg-transparent outline-none"
                    />
                </div>
                <button type="submit" className="btn btn-primary">
                    {t("search.title")}
                </button>
            </form>

            {query.length >= 2 && (
                <p className="text-base-content/60 text-sm">
                    {hits.length === 0
                        ? t("search.nothing")
                        : t("search.found", { count: hits.length })}
                </p>
            )}

            {KINDS.map((kind) => {
                const group = hits.filter((hit) => hit.kind === kind);
                if (group.length === 0) return null;
                return (
                    <section key={kind} className="flex flex-col gap-2">
                        <h2 className="font-medium text-base-content/70 text-sm">
                            {t(`search.kinds.${kind}` as "search.kinds.person")}
                        </h2>
                        <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                            {group.map((hit) => (
                                <li key={`${hit.kind}-${hit.id}`}>
                                    <Link
                                        href={searchHitHref(slug, hit)}
                                        className="flex flex-col gap-0.5 px-4 py-3 hover:bg-base-200"
                                    >
                                        <span className="font-medium text-sm">
                                            {hit.kind === "event"
                                                ? t(`events.${hit.title}` as "events.birth")
                                                : hit.title ||
                                                  (hit.kind === "photo"
                                                      ? t("media.one")
                                                      : t("common.unknown"))}
                                            {hit.kind === "event" && hit.detail
                                                ? ` · ${hit.detail}`
                                                : ""}
                                        </span>
                                        {hit.kind !== "event" && hit.detail && (
                                            <span className="truncate text-base-content/60 text-xs">
                                                {detailOf(hit)}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
