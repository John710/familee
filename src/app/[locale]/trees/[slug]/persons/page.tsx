import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PersonForm } from "@/components/persons/person-form";
import { PersonThumb } from "@/components/persons/person-thumb";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { todayIn, upcomingBirthdays } from "@/lib/age";
import { BIRTHDAY_DAYS, birthdayInput } from "@/lib/birthdays";
import { listPersonCards } from "@/lib/people";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

export default async function PersonsPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/persons`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const canEdit = atLeast(access.role, "editor");
    const cards = await listPersonCards(access.treeId);
    const t = await getTranslations();
    const birthdays = upcomingBirthdays(
        cards.map((card) => birthdayInput(card, slug)),
        todayIn(),
        BIRTHDAY_DAYS,
    );
    const dayFormat = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    });

    return (
        <div className="flex flex-col gap-10">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("person.many")}</h1>
                <Link href={`/trees/${slug}/tree`} className="text-primary text-sm">
                    {t("tree.view.open")}
                </Link>
            </header>

            <section className="flex flex-col gap-3">
                <h2 className="font-medium text-base-content/70 text-sm">{t("birthdays.title")}</h2>
                {birthdays.length === 0 ? (
                    <p className="text-base-content/60 text-sm">{t("birthdays.none")}</p>
                ) : (
                    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
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
                                            : dayFormat.format(new Date(`${entry.date}T00:00:00Z`))}
                                        {" · "}
                                        {t("birthdays.turns", { count: entry.turns })}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="flex flex-col gap-3">
                {cards.length === 0 ? (
                    <p className="text-base-content/60 text-sm">{t("common.empty")}</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                        {cards.map((card) => (
                            <li key={card.personId}>
                                <Link
                                    href={`/trees/${slug}/persons/${card.personId}`}
                                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-base-200"
                                >
                                    <span className="flex min-w-0 flex-col">
                                        <span className="font-medium text-sm">
                                            {card.fullName || t("common.unknown")}
                                        </span>
                                        {card.birthDate && card.birthPrecision === "day" && (
                                            <span className="text-base-content/60 text-xs">
                                                {t("person.birthdayOn", {
                                                    day: dayFormat.format(
                                                        new Date(`${card.birthDate}T00:00:00Z`),
                                                    ),
                                                })}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex items-center gap-2 text-base-content/60 text-xs">
                                        {card.birthYear && card.deathYear
                                            ? t("date.lifespan", {
                                                  birth: card.birthYear,
                                                  death: card.deathYear,
                                              })
                                            : card.birthYear
                                              ? t("date.lifespanBirthOnly", {
                                                    birth: card.birthYear,
                                                })
                                              : card.deathYear
                                                ? t("date.lifespanDeathOnly", {
                                                      death: card.deathYear,
                                                  })
                                                : null}
                                        {card.isLiving === false && (
                                            <span className="badge badge-neutral badge-sm">
                                                {t("person.deceased")}
                                            </span>
                                        )}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {canEdit && (
                <section className="card card-border bg-base-100">
                    <div className="card-body gap-5">
                        <h2 className="font-semibold text-lg">{t("person.add")}</h2>
                        <PersonForm
                            slug={slug}
                            initial={{
                                surname: "",
                                given: "",
                                patronymic: "",
                                suffix: "",
                                sex: "unknown",
                                birth: "",
                                death: "",
                                notes: "",
                            }}
                        />
                    </div>
                </section>
            )}
        </div>
    );
}
