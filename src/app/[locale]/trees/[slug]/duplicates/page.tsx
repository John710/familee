/**
 * Familee - the page of the people who look like one person entered twice
 *
 * For editors and above. It groups the people of the tree by their name and years (the rules are in
 * src/lib/duplicates.ts) and shows each group with its cards. Nothing is merged here by itself: a
 * merge is an edit the editor makes on purpose.
 */

import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
    type RecordDuplicateGroup,
    RecordDuplicateList,
} from "@/components/library/record-duplicate-list";
import { type DuplicateGroupView, DuplicateList } from "@/components/persons/duplicate-list";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cardToDuplicate, findDuplicates } from "@/lib/duplicates";
import { listPlaceDuplicates, listSourceDuplicates } from "@/lib/library";
import { listPersonCards } from "@/lib/people";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/**
 * The people of one tree who look like one person entered twice. Only those who may change the tree
 * see it: the merge itself is an edit. Nothing is merged here by itself - the page shows the groups
 * and the decision is the reader's.
 */
export default async function DuplicatesPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/duplicates`);
    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role, "editor")) notFound();

    const cards = await listPersonCards(access.treeId);
    const groups = findDuplicates(cards.map(cardToDuplicate));
    const t = await getTranslations();

    // The same picture for the two records of the archive that have no card of their own: the
    // places and the sources. A place carries the events, a source the citations.
    const placeGroups = await listPlaceDuplicates(access.treeId);
    const sourceGroups = await listSourceDuplicates(access.treeId);

    const placeViews: RecordDuplicateGroup[] = placeGroups.map((group) => ({
        key: group[0]?.id ?? "",
        entries: group.map((place) => ({
            id: place.id,
            label: place.name,
            detail: [
                t(`enums.place_kind.${place.kind}` as "enums.place_kind.other"),
                place.fullName && place.fullName !== place.name ? place.fullName : "",
            ]
                .filter(Boolean)
                .join(" · "),
            uses: place.uses,
        })),
    }));

    const sourceViews: RecordDuplicateGroup[] = sourceGroups.map((group) => ({
        key: group[0]?.id ?? "",
        entries: group.map((source) => ({
            id: source.id,
            label: source.title,
            detail: [source.author ?? "", source.callNumber ?? ""].filter(Boolean).join(" · "),
            uses: source.uses,
        })),
    }));

    const byId = new Map(cards.map((card) => [card.personId, card]));
    const yearsOf = (card: (typeof cards)[number]): string => {
        if (card.birthYear && card.deathYear) {
            return t("date.lifespan", { birth: card.birthYear, death: card.deathYear });
        }
        if (card.birthYear) return t("date.lifespanBirthOnly", { birth: card.birthYear });
        if (card.deathYear) return t("date.lifespanDeathOnly", { death: card.deathYear });
        return "";
    };

    const views: DuplicateGroupView[] = groups.map((group) => ({
        key: group.key,
        sameBirthYear: group.sameBirthYear,
        sameDeathYear: group.sameDeathYear,
        birthYearsUnknown: group.birthYearsUnknown,
        persons: group.persons.map((person) => {
            const card = byId.get(person.personId);
            return {
                personId: person.personId,
                name: person.fullName ?? "",
                years: card ? yearsOf(card) : "",
            };
        }),
    }));

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/persons`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("duplicates.title")}</h1>
                <p className="text-base-content/60 text-sm">{t("duplicates.hint")}</p>
            </header>

            <DuplicateList slug={slug} groups={views} />

            <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <h2 className="font-semibold text-lg">{t("duplicates.placesTitle")}</h2>
                    <p className="text-base-content/60 text-sm">{t("duplicates.placesHint")}</p>
                </div>
                <RecordDuplicateList
                    slug={slug}
                    kind="place"
                    groups={placeViews}
                    empty={t("duplicates.noPlaces")}
                />
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <h2 className="font-semibold text-lg">{t("duplicates.sourcesTitle")}</h2>
                    <p className="text-base-content/60 text-sm">{t("duplicates.sourcesHint")}</p>
                </div>
                <RecordDuplicateList
                    slug={slug}
                    kind="source"
                    groups={sourceViews}
                    empty={t("duplicates.noSources")}
                />
            </section>
        </div>
    );
}
