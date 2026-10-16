import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DeletePersonButton } from "@/components/persons/delete-person-button";
import { FamilyPanel } from "@/components/persons/family-panel";
import { PersonForm } from "@/components/persons/person-form";
import { PersonLibraryPanel } from "@/components/persons/person-library-panel";
import { PhotoAlbum } from "@/components/persons/photo-album";
import { RecordsPanel } from "@/components/persons/records-panel";
import { RelationFinder } from "@/components/persons/relation-finder";
import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { listOtherEventTypes } from "@/lib/actions/records";
import { relationPhrase, type Translator } from "@/lib/kinship-phrase";
import {
    listEventCitations,
    listPersonCitations,
    listPersonNotes,
    listPlaces,
    listSources,
} from "@/lib/library";
import { getPersonForEdit, listAdditionalNames, listOtherEvents } from "@/lib/people";
import { listEventPhotos, listPersonPhotos, listPhotoPeople } from "@/lib/photos";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { loadFamilies, loadTreeView } from "@/lib/tree-view";
import { listPersonOptions, listUnionsForPerson } from "@/lib/unions";

/**
 * The page of one person. Everybody who can see the tree reads it: the names, the events, the
 * family, the photographs and the details. The "view" mode is the reading page; the "edit" mode
 * is the same page with the forms in place of the details, and only editors get it. Editors see
 * a button to the edit mode on the reading page.
 */
export async function PersonPageBody({
    locale,
    slug,
    id,
    mode,
}: {
    locale: Locale;
    slug: string;
    id: string;
    mode: "view" | "edit";
}) {
    const user = await requireUser(
        locale,
        `/trees/${slug}/persons/${id}${mode === "edit" ? "/edit" : ""}`,
    );
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const person = await getPersonForEdit(access.treeId, id);
    if (!person) notFound();

    const canWrite = atLeast(access.role, "editor");
    // Without the right to write, the edit page is not shown: the reading page is.
    if (mode === "edit" && !canWrite)
        redirect(localizedPath(locale, `/trees/${slug}/persons/${id}`));
    const editing = mode === "edit";

    // The album, with the people who are in each picture: the tags are read for the pictures of
    // this person only, and the names come from the same view the rest of the page uses.
    const album = await listPersonPhotos(access.treeId, id);
    const tags = await listPhotoPeople(
        access.treeId,
        album.map((photo) => photo.mediaId),
    );
    const photos = album.map((photo) => {
        const tagged = tags.get(photo.mediaId) ?? [];
        return {
            mediaId: photo.mediaId,
            isPrimary: photo.isPrimary,
            crop: photo.crop,
            ratio: photo.width && photo.height ? photo.height / photo.width : null,
            caption: photo.caption,
            date: photo.takenStart,
            people: tagged.map((person) => person.name ?? "").filter((name) => name !== ""),
            personIds: tagged.map((person) => person.personId),
        };
    });

    // The tagging window needs everybody in the tree, and only the editor opens it.
    const people = editing
        ? (await listPersonOptions(access.treeId)).map((option) => ({
              personId: option.personId,
              name: option.name ?? "",
          }))
        : [];
    const names = await listAdditionalNames(id);
    const otherEvents = await listOtherEvents(id);
    const eventCitations = await listEventCitations(
        access.treeId,
        otherEvents.map((event) => event.id),
    );
    const events = await Promise.all(
        otherEvents.map(async (event) => ({
            ...event,
            citations: eventCitations.get(event.id) ?? [],
            photos: (await listEventPhotos(access.treeId, event.id)).map((photo) => ({
                mediaId: photo.mediaId,
                caption: photo.caption,
                date: photo.takenStart,
            })),
        })),
    );
    const eventTypes = await listOtherEventTypes();
    const places = (await listPlaces(access.treeId)).map((place) => ({
        id: place.id,
        name: place.name,
    }));
    const notes = await listPersonNotes(access.treeId, id);
    const citations = await listPersonCitations(access.treeId, id);
    const sources = (await listSources(access.treeId)).map((source) => ({
        id: source.id,
        title: source.title,
    }));
    const unions = await listUnionsForPerson(access.treeId, id);
    const options = (await listPersonOptions(access.treeId))
        .filter((option) => option.personId !== id)
        .map((option) => ({ personId: option.personId, name: option.name ?? "" }));
    // The unions as the kinship functions want them, for the "related to" panel below.
    const families = await loadFamilies(access.treeId);
    const t = await getTranslations();
    const fullName = [person.surname, person.given, person.patronymic, person.suffix]
        .filter(Boolean)
        .join(" ");
    const basePath = `/trees/${slug}/persons/${id}`;

    // The same figures the card's panel shows in the tree: age, the timeline with places, the
    // "you" mark. Read through the tree view so the two places never disagree.
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
    const [headlineRow] = await db
        .select({ headline: schema.persons.headline })
        .from(schema.persons)
        .where(eq(schema.persons.id, id))
        .limit(1);
    const headline = headlineRow?.headline ?? null;
    const view = await loadTreeView(access.treeId, slug, membership?.selfPersonId ?? null);
    const node = view.nodes.find((candidate) => candidate.id === `person-${id}`);
    const card = node?.type === "person" ? node.data : null;
    // How this person is related to the signed-in person, in the same words as the tree.
    const relation = card
        ? relationPhrase(card.kinship, card.sex, t as unknown as Translator)
        : null;
    const birthPlace = card?.details.timeline.find((item) => item.typeCode === "birth")?.place;
    const deathPlace = card?.details.timeline.find((item) => item.typeCode === "death")?.place;

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-3">
                <Link href={`/trees/${slug}/persons`} className="text-primary text-sm">
                    {t("person.many")}
                </Link>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h1 className="font-semibold font-serif text-3xl">
                            {fullName || t("common.unknown")}
                        </h1>
                        {person.isLiving === false && (
                            <span className="badge badge-neutral w-fit">
                                {t("person.deceased")}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link href={`/trees/${slug}/gallery/${id}`} className="btn btn-sm">
                            {t("gallery.albumLink")}
                        </Link>
                        {editing ? (
                            <Link href={basePath} className="btn btn-sm">
                                {t("person.openCard")}
                            </Link>
                        ) : (
                            canWrite && (
                                <Link href={`${basePath}/edit`} className="btn btn-primary btn-sm">
                                    {t("person.edit")}
                                </Link>
                            )
                        )}
                    </div>
                </div>
            </header>

            {!editing && card && (
                <section className="card card-border bg-base-100">
                    <div className="card-body gap-5">
                        {(headline || card.age || card.isSelf || relation) && (
                            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
                                {headline && (
                                    <p className="w-full text-base-content/80">{headline}</p>
                                )}
                                {relation && (
                                    <dl className="flex flex-col">
                                        <dt className="text-base-content/60 text-xs">
                                            {t("tree.view.relationTitle")}
                                        </dt>
                                        <dd>{relation}</dd>
                                    </dl>
                                )}
                                {card.age && (
                                    <dl className="flex flex-col">
                                        <dt className="text-base-content/60 text-xs">
                                            {card.age.living
                                                ? t("person.ageNow")
                                                : t("person.ageLived")}
                                        </dt>
                                        <dd>
                                            {card.age.approximate ? "≈ " : ""}
                                            {t("person.years", { count: card.age.years })}
                                        </dd>
                                    </dl>
                                )}
                                {card.isSelf && (
                                    <span className="badge badge-primary">
                                        {t("tree.view.you")}
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <h2 className="font-semibold text-lg">{t("tree.view.timeline")}</h2>
                            {card.details.timeline.length === 0 ? (
                                <p className="text-base-content/60 text-sm">
                                    {t("tree.view.noTimeline")}
                                </p>
                            ) : (
                                <ol className="flex flex-col gap-3 border-base-300 border-l pl-4">
                                    {card.details.timeline.map((item) => (
                                        <li
                                            key={item.key}
                                            className="relative flex flex-col gap-0.5"
                                        >
                                            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary" />
                                            <span className="text-base-content/60 text-xs">
                                                {[item.date ?? t("common.none"), item.place]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </span>
                                            <span className="text-sm">
                                                {t(`events.${item.typeCode}` as "events.birth")}
                                                {item.partner
                                                    ? ` · ${t("tree.view.withPartner", { name: item.partner })}`
                                                    : ""}
                                                {item.value ? ` · ${item.value}` : ""}
                                            </span>
                                            {item.description && (
                                                <span className="whitespace-pre-line text-base-content/70 text-xs">
                                                    {item.description}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {!editing && card && options.length > 0 && (
                <RelationFinder
                    personId={id}
                    personSex={card.sex}
                    people={options}
                    families={families}
                />
            )}

            <section className="card card-border bg-base-100">
                <div className="card-body gap-5">
                    <h2 className="font-semibold text-lg">{t("media.many")}</h2>
                    <PhotoAlbum
                        slug={slug}
                        personId={person.personId}
                        photos={photos}
                        people={people}
                        canEdit={editing}
                    />
                </div>
            </section>

            <section className="card card-border bg-base-100">
                <div className="card-body gap-5">
                    <h2 className="font-semibold text-lg">{t("person.otherEvents")}</h2>
                    <RecordsPanel
                        slug={slug}
                        personId={person.personId}
                        names={names}
                        events={events}
                        eventTypes={eventTypes}
                        places={places}
                        sources={sources}
                        canEdit={editing}
                    />
                </div>
            </section>

            <section className="card card-border bg-base-100">
                <div className="card-body gap-5">
                    <h2 className="font-semibold text-lg">{t("family.many")}</h2>
                    {editing ? (
                        <FamilyPanel
                            slug={slug}
                            personId={person.personId}
                            unions={unions}
                            options={options}
                        />
                    ) : unions.length === 0 ? (
                        <p className="text-base-content/60 text-sm">{t("family.none")}</p>
                    ) : (
                        <ul className="flex flex-col gap-2 text-sm">
                            {unions.map((union) => (
                                <li key={union.familyId}>
                                    {union.partner ? union.partner.name : t("family.noPartner")}
                                    {union.children.length > 0 &&
                                        ` · ${union.children.map((child) => child.name).join(", ")}`}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            <section className="card card-border bg-base-100">
                <div className="card-body gap-5">
                    <h2 className="font-semibold text-lg">{t("library.notes")}</h2>
                    <PersonLibraryPanel
                        slug={slug}
                        personId={person.personId}
                        notes={notes}
                        citations={citations}
                        sources={sources}
                        canEdit={editing}
                    />
                </div>
            </section>

            <section className="card card-border bg-base-100">
                <div className="card-body gap-5">
                    {editing ? (
                        <PersonForm
                            slug={slug}
                            personId={person.personId}
                            isLiving={person.isLiving}
                            initial={{
                                surname: person.surname ?? "",
                                given: person.given ?? "",
                                patronymic: person.patronymic ?? "",
                                suffix: person.suffix ?? "",
                                sex: person.sex,
                                birth: person.birthOriginal ?? "",
                                death: person.deathOriginal ?? "",
                                notes: person.notes,
                                birthPlaceId: person.birthPlaceId ?? "",
                                deathPlaceId: person.deathPlaceId ?? "",
                            }}
                            places={places}
                        />
                    ) : (
                        <dl className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <dt className="text-base-content/60 text-xs">
                                    {t("person.fields.sex")}
                                </dt>
                                <dd>{t(`enums.sex.${person.sex}`)}</dd>
                            </div>
                            <div>
                                <dt className="text-base-content/60 text-xs">
                                    {t("person.fields.birth")}
                                </dt>
                                <dd>
                                    {[person.birthOriginal || t("common.none"), birthPlace]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-base-content/60 text-xs">
                                    {t("person.fields.death")}
                                </dt>
                                <dd>
                                    {[person.deathOriginal || t("common.none"), deathPlace]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </dd>
                            </div>
                            <div className="sm:col-span-2">
                                <dt className="text-base-content/60 text-xs">
                                    {t("person.fields.notes")}
                                </dt>
                                <dd className="whitespace-pre-line">
                                    {person.notes || t("common.none")}
                                </dd>
                            </div>
                        </dl>
                    )}
                </div>
            </section>

            {editing && (
                <section className="card card-border border-error/40 bg-base-100">
                    <div className="card-body gap-3">
                        <h2 className="font-semibold text-error text-lg">
                            {t("person.delete.title")}
                        </h2>
                        <DeletePersonButton
                            slug={slug}
                            personId={person.personId}
                            photos={photos.length}
                        />
                    </div>
                </section>
            )}
        </div>
    );
}
