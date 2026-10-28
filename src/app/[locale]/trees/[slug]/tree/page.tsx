import { and, eq } from "drizzle-orm";
import { ImageDown } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PersonThumb } from "@/components/persons/person-thumb";
import { CalendarTokenButton } from "@/components/trees/calendar-token-button";
import { TreeCanvas } from "@/components/trees/tree-canvas";
import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { todayIn, upcomingBirthdays } from "@/lib/age";
import { birthdayInput } from "@/lib/birthdays";
import { listPersonCards } from "@/lib/people";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { loadTreeView } from "@/lib/tree-view";

type Params = { locale: string; slug: string };

/** The birthdays of the next two weeks: the notice that opens the tree page. */
const BIRTHDAY_DAYS = 14;

export default async function TreePage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/tree`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const [membership] = await db
        .select({ selfPersonId: schema.treeMembers.selfPersonId })
        .from(schema.treeMembers)
        .where(
            and(
                eq(schema.treeMembers.treeId, access.treeId),
                eq(schema.treeMembers.userId, user.id),
            ),
        )
        .limit(1);

    const view = await loadTreeView(access.treeId, slug, membership?.selfPersonId ?? null);
    const t = await getTranslations();

    const [settings] = await db
        .select({ calendarToken: schema.trees.calendarToken })
        .from(schema.trees)
        .where(eq(schema.trees.id, access.treeId))
        .limit(1);

    // A calendar app needs the whole address; BETTER_AUTH_URL is the address of the browser
    // (see .env.example). Without it the path alone is still useful behind the same host.
    const calendarUrl = settings
        ? `${(process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")}/api/calendar/${settings.calendarToken}`
        : null;

    const today = todayIn();
    const birthdays = upcomingBirthdays(
        (await listPersonCards(access.treeId)).map((card) => birthdayInput(card, slug)),
        today,
        BIRTHDAY_DAYS,
    ).slice(0, 8);
    const dayFormat = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    });

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                        {access.title}
                    </Link>
                    <h1 className="font-semibold font-serif text-3xl">{t("tree.view.open")}</h1>
                    <p className="text-base-content/60 text-sm">{t("tree.view.hint")}</p>
                </div>
                {/* The tree leaves the screen as one picture: see .../tree/export. */}
                {!view.empty && (
                    <Link
                        href={`/trees/${slug}/tree/export`}
                        className="btn btn-ghost btn-sm shrink-0 gap-2"
                    >
                        <ImageDown className="size-4" aria-hidden="true" />
                        {t("tree.export.open")}
                    </Link>
                )}
            </header>

            {birthdays.length > 0 && (
                <section className="card card-border bg-base-100">
                    <div className="card-body gap-3 p-4">
                        <h2 className="font-medium text-sm">{t("birthdays.title")}</h2>
                        <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                            {birthdays.map((entry) => (
                                <li key={entry.personId} className="flex items-center gap-2">
                                    <PersonThumb name={entry.name} photoUrl={entry.photoUrl} />
                                    <span className="flex flex-col">
                                        <Link
                                            href={`/trees/${slug}/persons/${entry.personId}`}
                                            className="link"
                                        >
                                            {entry.name || t("common.unknown")}
                                        </Link>
                                        <span className="text-base-content/60 text-xs">
                                            {entry.inDays === 0
                                                ? t("birthdays.today")
                                                : dayFormat.format(
                                                      new Date(`${entry.date}T00:00:00Z`),
                                                  )}
                                            {" · "}
                                            {t("birthdays.turns", { count: entry.turns })}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            )}

            {view.empty ? (
                <section className="card card-border bg-base-100">
                    <div className="card-body">
                        <p className="text-base-content/60 text-sm">{t("tree.empty")}</p>
                    </div>
                </section>
            ) : (
                <section
                    className="h-[70dvh] min-h-[420px] overflow-hidden rounded-box border border-base-300 bg-base-200/40"
                    aria-label={t("tree.view.open")}
                >
                    <TreeCanvas
                        nodes={view.nodes}
                        edges={view.edges}
                        canEdit={atLeast(access.role, "editor")}
                    />
                </section>
            )}

            {calendarUrl && (
                <section className="card card-border bg-base-100">
                    <div className="card-body gap-2 p-4">
                        <h2 className="font-medium text-sm">{t("calendar.title")}</h2>
                        <p className="text-base-content/60 text-sm">{t("calendar.hint")}</p>
                        <code className="break-all rounded-box bg-base-200 px-3 py-2 text-xs">
                            {calendarUrl}
                        </code>
                        {atLeast(access.role, "admin") && <CalendarTokenButton slug={slug} />}
                    </div>
                </section>
            )}
        </div>
    );
}
