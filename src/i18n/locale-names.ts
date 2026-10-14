/**
 * Familee - the names of the languages, each in its own language
 *
 * Every messages/<code>.json file names its language in its own locale.name key, so the list in
 * the switcher reads the same whatever the current interface language is, and a new language
 * needs no code change.
 */

import { getTranslations } from "next-intl/server";

import { locales } from "@/i18n/routing";

export async function localeNames(): Promise<Record<string, string>> {
    const names: Record<string, string> = {};
    for (const locale of locales) {
        const t = await getTranslations({ locale, namespace: "locale" });
        names[locale] = t("name");
    }
    return names;
}
