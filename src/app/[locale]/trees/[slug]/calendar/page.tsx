import { and, eq, isNotNull } from "drizzle-orm";
import { Cake, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { todayIn } from "@/lib/age";
import { listPersonCards } from "@/lib/people";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { type Anniversary, buildMonth, yearsSince } from "@/lib/tree-calendar";
import { loadFamilies } from "@/lib/tree-view";

type Params = { locale: string; slug: string };
type SearchParams = { y?: string; m?: string };

/** The month the page shows: the one that was asked for, or the month of today. */
function shownMonth(search: SearchParams, today: string): { year: number; month: number } {
    const now = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
    const year = Number(search.y);
    const month = Number(search.m) - 1;
    if (!Number.isInteger(year) || year < 1 || year > 9999) return now;
    if (!Number.isInteger(month) || month < 0 || month > 11) return now;
    return { year, month };
}

/**
 * The calendar of a tree: the birthdays of its people and their dated events, one month at a time.
 *
 * An anniversary comes round every year, so an event of 1890 stands in the month it happened in
 * whichever year is open here: the year is read beside it, not used to hide it. The month is part
 * of the address, so a month can be linked and the browser's back button works.
 */
export default async function TreeCalendarPage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<SearchParams>;
}) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/calendar`);

    // Outsiders get the same 404 as a tree that does not exist: no hints about it.
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const t = await getTranslations();
    const today = todayIn();
    const { year, month } = shownMonth(await searchParams, today);

    const cards = await listPersonCards(access.treeId);
    const nameOf = new Map(cards.map((card) => [card.personId, card.fullName ?? ""]));

    const anniversaries: Anniversary[] = [];
    for (const card of cards) {
        // Only a birthday known to the day has a place on the grid.
        if (!card.birthDate || card.birthPrecision !== "day") continue;
        anniversaries.push({
            key: `birth-${card.personId}`,
            monthDay: card.birthDate.slice(5),
            year: Number(card.birthDate.slice(0, 4)),
            kind: "birthday",
            typeCode: "birth",
            title: card.fullName || t("common.unknown"),
            href: `/trees/${slug}/persons/${card.personId}`,
            living: card.isLiving,
        });
    }

    const events = await db
        .select({
            id: schema.events.id,
            personId: schema.events.personId,
            familyId: schema.events.familyId,
            typeCode: schema.events.typeCode,
            sortDate: schema.events.sortDate,
        })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.treeId, access.treeId),
                eq(schema.events.datePrecision, "day"),
                isNotNull(schema.events.sortDate),
            ),
        );

    const partnersOf = new Map(
        (await loadFamilies(access.treeId)).map((family) => [family.id, family.partners]),
    );

    for (const event of events) {
        if (!event.sortDate) continue;
        // A birth already stands on the grid as the birthday of its person.
        if (event.typeCode === "birth") continue;

        const partners = event.familyId
            ? (partnersOf.get(event.familyId) ?? [])
                  .map((personId) => nameOf.get(personId) ?? "")
                  .filter(Boolean)
            : [];
        const first = partners[0] ?? "";
        const second = partners[1] ?? "";
        const title = event.personId
            ? (nameOf.get(event.personId) ?? t("common.unknown"))
            : second
              ? t("calendar.partners", { first, second })
              : first;
        if (!title) continue;

        anniversaries.push({
            key: `event-${event.id}`,
            monthDay: event.sortDate.slice(5),
            year: Number(event.sortDate.slice(0, 4)),
            kind: "event",
            typeCode: event.typeCode,
            title,
            // An event of a union belongs to the couple, not to one card; the person's own events
            // open that person.
            href: event.personId ? `/trees/${slug}/persons/${event.personId}` : null,
            living: null,
        });
    }

    const cells = buildMonth(anniversaries, year, month);
    const shown = cells.reduce((total, cell) => total + cell.entries.length, 0);

    const monthFormat = new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
    // A month's name is written in lower case in Russian: only its first letter is raised.
    const monthName = monthFormat.format(new Date(Date.UTC(year, month, 1)));
    const monthHeading = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    // The 1st of January 2024 is a Monday: the columns run from Monday to Sunday, as a Russian
    // calendar does.
    const weekdays = Array.from({ length: 7 }, (_, index) =>
        weekdayFormat.format(new Date(Date.UTC(2024, 0, 1 + index))),
    );

    const step = (delta: number) => {
        const month_ = month + delta;
        if (month_ < 0) return { year: year - 1, month: 11 };
        if (month_ > 11) return { year: year + 1, month: 0 };
        return { year, month: month_ };
    };
    const previous = step(-1);
    const next = step(1);
    const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
    const hrefOf = (target: { year: number; month: number }) =>
        `/trees/${slug}/calendar?y=${target.year}&m=${target.month + 1}`;

    /** What one entry says on the day: the person, and the age or the event with its year below. */
    function entryLines(entry: Anniversary): { title: string; meta: string } {
        const years = yearsSince(entry, year);
        if (entry.kind === "birthday") {
            if (years !== null && entry.living !== false) {
                return { title: entry.title, meta: t("date.age", { years }) };
            }
            return {
                title: entry.title,
                meta: entry.year === null ? "" : t("date.lifespanBirthOnly", { birth: entry.year }),
            };
        }
        const what = t(`events.${entry.typeCode}` as "events.fact");
        return {
            title: entry.title,
            meta: entry.year === null ? what : `${what} · ${entry.year}`,
        };
    }

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("calendar.title")}</h1>
            </header>

            <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        <Link
                            href={hrefOf(previous)}
                            aria-label={t("calendar.previous")}
                            title={t("calendar.previous")}
                            className="btn btn-ghost btn-sm btn-square"
                        >
                            <ChevronLeft className="size-4" />
                        </Link>
                        <h2 className="min-w-44 text-center font-medium text-lg">{monthHeading}</h2>
                        <Link
                            href={hrefOf(next)}
                            aria-label={t("calendar.next")}
                            title={t("calendar.next")}
                            className="btn btn-ghost btn-sm btn-square"
                        >
                            <ChevronRight className="size-4" />
                        </Link>
                    </div>
                    {(year !== current.year || month !== current.month) && (
                        <Link href={hrefOf(current)} className="btn btn-ghost btn-sm">
                            {t("calendar.today")}
                        </Link>
                    )}
                </div>

                {shown === 0 && (
                    <p className="text-base-content/60 text-sm">{t("calendar.emptyMonth")}</p>
                )}

                <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
                    <div className="grid grid-cols-7 border-base-300 border-b bg-base-200 text-center text-base-content/60 text-xs">
                        {weekdays.map((label) => (
                            <span key={label} className="py-1">
                                {label}
                            </span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {cells.map((cell, index) => (
                            <div
                                key={cell.date ?? `blank-${index}`}
                                className={`flex min-h-24 flex-col gap-1 border-base-300 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 ${
                                    cell.date === today ? "bg-primary/10" : ""
                                }`}
                            >
                                {cell.day !== null && (
                                    <span
                                        className={`self-end text-xs tabular-nums ${
                                            cell.date === today
                                                ? "font-semibold text-primary"
                                                : "text-base-content/50"
                                        }`}
                                    >
                                        {cell.day}
                                    </span>
                                )}
                                {cell.entries.map((entry) => {
                                    const { title, meta } = entryLines(entry);
                                    const body = (
                                        <>
                                            <span className="flex items-center gap-1">
                                                {entry.kind === "birthday" ? (
                                                    <Cake
                                                        className="size-3.5 shrink-0 text-primary"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <Star
                                                        className="size-3.5 shrink-0 text-base-content/50"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <span className="line-clamp-2">{title}</span>
                                            </span>
                                            {meta && (
                                                <span className="pl-[1.125rem] text-[0.6875rem] text-base-content/50">
                                                    {meta}
                                                </span>
                                            )}
                                        </>
                                    );
                                    const full = meta ? `${title} · ${meta}` : title;
                                    return entry.href ? (
                                        <Link
                                            key={entry.key}
                                            href={entry.href}
                                            title={full}
                                            className="flex flex-col rounded px-1 py-0.5 text-xs transition-colors hover:bg-base-200"
                                        >
                                            {body}
                                        </Link>
                                    ) : (
                                        <span
                                            key={entry.key}
                                            title={full}
                                            className="flex flex-col px-1 py-0.5 text-xs"
                                        >
                                            {body}
                                        </span>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
