/**
 * Familee - the page of one person, for editing
 *
 * Renders the body of the person's page in edit mode, with the forms in place of the details
 * (components/persons/person-page-body.tsx). Only editors get it; anybody else is sent back to the
 * reading page.
 */

import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { PersonPageBody } from "@/components/persons/person-page-body";
import { routing } from "@/i18n/routing";

type Params = { locale: string; slug: string; id: string };

/** The editing page of a person: the forms and the lists with their edit buttons. Editors only. */
export default async function PersonEditPage({ params }: { params: Promise<Params> }) {
    const { locale, slug, id } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    return <PersonPageBody locale={locale} slug={slug} id={id} mode="edit" />;
}
