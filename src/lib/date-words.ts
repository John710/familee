/**
 * Familee - the words the date parser knows, taken from the translation files
 *
 * Each locale lists its words under dates.words in messages/<locale>.json, with the alternatives
 * separated by "|". The words of the English file are always added, because the GEDCOM words
 * are English and an imported file must read in any locale. Adding a language is therefore a
 * message file and nothing else.
 *
 * Only server code uses this module: it reads the messages of the request's locale.
 */

import { getTranslations } from "next-intl/server";

import type { DateWordKey, DateWords } from "@/lib/fuzzy-date";

const KEYS: readonly DateWordKey[] = [
    "between",
    "and",
    "from",
    "to",
    "before",
    "after",
    "estimated",
    "calculated",
    "about",
    "yearSuffixes",
];

/** The words of the current request's locale, plus the English ones. */
export async function loadDateWords(): Promise<DateWords> {
    const current = await getTranslations("dates.words");
    const english = await getTranslations({ locale: "en", namespace: "dates.words" });

    const words = {} as DateWords;
    for (const key of KEYS) {
        const listed = [
            ...splitAlternatives(current(key as Parameters<typeof current>[0])),
            ...splitAlternatives(english(key as Parameters<typeof english>[0])),
        ];
        words[key] = [...new Set(listed)];
    }
    return words;
}

/**
 * The word that is written into a date by the program (for example when an imported GEDCOM
 * date is turned into the editor's form): the first alternative of the current locale.
 */
export function primaryWord(words: DateWords, key: DateWordKey): string {
    return words[key][0] ?? "";
}

function splitAlternatives(text: string): string[] {
    return text
        .split("|")
        .map((word) => word.trim().toLowerCase())
        .filter((word) => word.length > 0);
}
