import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { PersonForm } from "@/components/persons/person-form";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getPersonForEdit } from "@/lib/people";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

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
                                <dt className="text-base-content/60 text-xs">{t("person.fields.birth")}</dt>
                                <dd>{person.birthOriginal || t("common.none")}</dd>
                            </div>
                            <div>
                                <dt className="text-base-content/60 text-xs">{t("person.fields.death")}</dt>
                                <dd>{person.deathOriginal || t("common.none")}</dd>
                            </div>
                            <div className="sm:col-span-2">
                                <dt className="text-base-content/60 text-xs">{t("person.fields.notes")}</dt>
                                <dd className="whitespace-pre-line">{person.notes || t("common.none")}</dd>
                            </div>
                        </dl>
                    )}
                </div>
            </section>
        </div>
    );
}
