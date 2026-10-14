import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { FamilyPanel } from "@/components/persons/family-panel";
import { PersonForm } from "@/components/persons/person-form";
import { PersonLibraryPanel } from "@/components/persons/person-library-panel";
import { PhotoAlbum } from "@/components/persons/photo-album";
import { RecordsPanel } from "@/components/persons/records-panel";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { listOtherEventTypes } from "@/lib/actions/records";
import { listPersonCitations, listPersonNotes, listSources } from "@/lib/library";
import { getPersonForEdit, listAdditionalNames, listOtherEvents } from "@/lib/people";
import { listEventPhotos, listPersonPhotos } from "@/lib/photos";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
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

    const photos = (await listPersonPhotos(access.treeId, id)).map((photo) => ({
        mediaId: photo.mediaId,
        isPrimary: photo.isPrimary,
        crop: photo.crop,
        ratio: photo.width && photo.height ? photo.height / photo.width : null,
    }));
    const names = await listAdditionalNames(id);
    const events = await Promise.all(
        (await listOtherEvents(id)).map(async (event) => ({
            ...event,
            photos: (await listEventPhotos(access.treeId, event.id)).map((photo) => ({
                mediaId: photo.mediaId,
            })),
        })),
    );
    const eventTypes = await listOtherEventTypes();
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
    const t = await getTranslations();
    const fullName = [person.surname, person.given, person.patronymic].filter(Boolean).join(" ");
    const basePath = `/trees/${slug}/persons/${id}`;

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

            <section className="card card-border bg-base-100">
                <div className="card-body gap-5">
                    <h2 className="font-semibold text-lg">{t("media.many")}</h2>
                    <PhotoAlbum
                        slug={slug}
                        personId={person.personId}
                        photos={photos}
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
                                sex: person.sex,
                                birth: person.birthOriginal ?? "",
                                death: person.deathOriginal ?? "",
                                notes: person.notes,
                            }}
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
                                <dd>{person.birthOriginal || t("common.none")}</dd>
                            </div>
                            <div>
                                <dt className="text-base-content/60 text-xs">
                                    {t("person.fields.death")}
                                </dt>
                                <dd>{person.deathOriginal || t("common.none")}</dd>
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
        </div>
    );
}
