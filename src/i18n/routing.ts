/**
 * Familee - the list of languages and the routing rules
 *
 * TO ADD A NEW LANGUAGE exactly two steps are needed:
 *   1. put a messages/<code>.json file in place (the easiest way is to copy
 *      messages/en.json and translate the values);
 *   2. add the language code to the `locales` array below.
 *
 * There is no need to translate the whole file at once: any key missing from
 * the new language is taken from the default language automatically
 * (see src/i18n/request.ts), so the interface does not break.
 */

import { defineRouting } from "next-intl/routing";

/** Language codes in BCP 47 form. The first is not necessarily the main one. */
export const locales = ["ru", "en"] as const;

export type Locale = (typeof locales)[number];

/** The language we fall back to, and the one that lives in the URL unprefixed. */
export const defaultLocale: Locale = "ru";

/**
 * The names of the languages in the languages themselves - for the switcher.
 * There is no need to duplicate them in messages/*.json: the list has to read
 * the same no matter what the current interface language is.
 */
export const localeLabels: Record<Locale, string> = {
    ru: "Русский",
    en: "English",
};

export const routing = defineRouting({
    locales,
    defaultLocale,

    /**
     * "as-needed": Russian lives at /, the other languages carry a prefix
     * (/en/tree). That way the links already shared inside the family do not
     * break when new languages are added.
     */
    localePrefix: "as-needed",

    /** The chosen language is remembered in a cookie for a year. */
    localeCookie: {
        name: "familee.locale",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
    },

    /** The very first visit follows the browser's Accept-Language header. */
    localeDetection: true,
});
