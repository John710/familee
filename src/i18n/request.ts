/**
 * Familee - loading the translations for every request
 *
 * The main thing here is the "soft" translation: the file of the requested
 * language is layered on top of the default one. If a user added their own
 * messages/de.json and translated only half of the keys, the other half
 * quietly comes from the default language (English, see routing.ts) instead of turning into
 * captions like "person.fields.surname" on the screen.
 */

import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { appTimeZone } from "@/lib/age";
import { defaultLocale, type Locale, routing } from "./routing";

/** A tree of translations: a value is either a string or a nested section. */
type MessageTree = { [key: string]: string | MessageTree };

/**
 * The date and number formats shared by the whole application.
 * Declared here so that `t('...', {date})` and `useFormatter()` give
 * the same result on the server and in the browser.
 */
export const formats = {
    dateTime: {
        /** 12 Mar 1901 */
        short: { day: "numeric", month: "short", year: "numeric" },
        /** 12 March 1901 */
        long: { day: "numeric", month: "long", year: "numeric" },
        /** March 1901 - when only the month is known */
        month: { month: "long", year: "numeric" },
        /** 1901 - when only the year is known */
        year: { year: "numeric" },
        /** 12 March 1901, 14:30 - for the history of edits */
        full: {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        },
    },
    number: {
        integer: { maximumFractionDigits: 0 },
        coordinate: { minimumFractionDigits: 4, maximumFractionDigits: 6 },
    },
} as const;

function isSection(value: unknown): value is MessageTree {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Layers `override` on top of `base`. Empty strings in a translation count
 * as "not translated yet" and keep the value from `base`.
 */
function withFallback(base: MessageTree, override: MessageTree): MessageTree {
    const result: MessageTree = { ...base };

    for (const [key, value] of Object.entries(override)) {
        const original = result[key];

        if (isSection(value)) {
            result[key] = isSection(original) ? withFallback(original, value) : value;
        } else if (typeof value === "string" && value.trim() !== "") {
            result[key] = value;
        }
    }

    return result;
}

async function loadMessages(locale: Locale): Promise<MessageTree> {
    const imported = (await import(`../../messages/${locale}.json`)) as {
        default: MessageTree;
    };
    return imported.default;
}

export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale = hasLocale(routing.locales, requested) ? requested : defaultLocale;

    const fallback = await loadMessages(defaultLocale);
    const messages =
        locale === defaultLocale ? fallback : withFallback(fallback, await loadMessages(locale));

    return {
        locale,
        messages,
        formats,

        /**
         * The dates of events are plain calendar dates without a time, but the
         * time of an edit is shown in the time zone of the server.
         */
        timeZone: appTimeZone(),

        /**
         * A missing key means an unfinished translation, not a breakage:
         * a warning goes to the server console, and the user is shown
         * the last part of the key.
         */
        onError(error) {
            if (error.code === "MISSING_MESSAGE") {
                if (process.env.NODE_ENV !== "production") {
                    console.warn(`[i18n] no translation: ${error.message}`);
                }
                return;
            }
            console.error(error);
        },

        getMessageFallback({ key }) {
            return key.split(".").at(-1) ?? key;
        },
    };
});
