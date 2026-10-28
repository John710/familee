/**
 * Familee - the page of one person, for reading
 *
 * Renders the body of the person's page in view mode (components/persons/person-page-body.tsx).
 * Everybody who can see the tree reads it; the editors find the button to the edit page here.
 */

import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { PersonPageBody } from "@/components/persons/person-page-body";
import { routing } from "@/i18n/routing";

type Params = { locale: string; slug: string; id: string };

/** The page of a person for reading. Everybody in the tree sees it; editors get a button to edit. */
export default async function PersonPage({ params }: { params: Promise<Params> }) {
    const { locale, slug, id } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    return <PersonPageBody locale={locale} slug={slug} id={id} mode="view" />;
}
