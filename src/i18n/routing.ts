/**
 * Familee - the list of languages and the routing rules
 *
 * TO ADD A NEW LANGUAGE put a messages/<code>.json file in place (the easiest way is to copy
 * messages/en.json, translate the values and set locale.name to the name of the language in
 * that language). Nothing else changes: the list is read from the file names at build time.
 *
 * There is no need to translate the whole file at once: any key missing from
 * the new language is taken from the default language automatically
 * (see src/i18n/request.ts), so the interface does not break.
 */

import { defineRouting } from "next-intl/routing";

/** Language codes in BCP 47 form: one per message file, listed at build time in next.config.ts. */
export const locales: string[] = JSON.parse(process.env.FAMILEE_LOCALES ?? '["en"]');

/** A language code from the list above. */
export type Locale = string;

/** The language we fall back to, and the one that lives in the URL unprefixed. */
export const defaultLocale: Locale = "en";

/**
 * The cookie in which the chosen language is kept. The switcher sets it itself, because the
 * unprefixed address of the default language does not refresh it.
 */
export const localeCookieName = "familee.locale";

export const routing = defineRouting({
    locales,
    defaultLocale,

    /**
     * "as-needed": the default language (English) lives at /, the other languages carry a
     * prefix (/ru/tree). That way the links already shared inside the family do not
     * break when new languages are added.
     */
    localePrefix: "as-needed",

    /** The chosen language is remembered in a cookie for a year. */
    localeCookie: {
        name: localeCookieName,
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
    },

    /** The very first visit follows the browser's Accept-Language header. */
    localeDetection: true,
});
