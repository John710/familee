import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FamilyPanel } from "@/components/persons/family-panel";
import { PersonForm } from "@/components/persons/person-form";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getPersonForEdit } from "@/lib/people";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { listPersonOptions, listUnionsForPerson } from "@/lib/unions";

type Params = { locale: string; slug: string; id: string };

export default async function PersonPage({ params }: { params: Promise<Params> }) {
    const { locale, slug, id } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/persons/${id}`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const person = await getPersonForEdit(access.treeId, id);
    if (!person) notFound();

    const canEdit = atLeast(access.role, "editor");
    const unions = await listUnionsForPerson(access.treeId, id);
    const options = (await listPersonOptions(access.treeId))
        .filter((option) => option.personId !== id)
        .map((option) => ({ personId: option.personId, name: option.name ?? "" }));
    const t = await getTranslations();
    const fullName = [person.surname, person.given, person.patronymic].filter(Boolean).join(" ");

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/persons`} className="text-primary text-sm">
                    {t("person.many")}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">
                    {fullName || t("common.unknown")}
                </h1>
                {person.isLiving === false && (
                    <span className="badge badge-neutral w-fit">{t("person.deceased")}</span>
                )}
            </header>

            <section className="card card-border bg-base-100">
                <div className="card-body gap-5">
                    <h2 className="font-semibold text-lg">{t("family.many")}</h2>
                    {canEdit ? (
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
                    {canEdit ? (
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
