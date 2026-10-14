/**
 * Familee - the plan of a GEDCOM import (nothing is written here)
 *
 * Takes the records from src/lib/gedcom.ts and says what the import would create:
 * persons with their names, sex and life dates, unions with partners and children.
 * Dates are turned into the form the person editor accepts; everything that cannot
 * be read stays in the notes and is listed as a warning.
 */

import { type DateWords, parseFuzzyDate } from "@/lib/fuzzy-date";
import { child, childrenOf, type GedLine, type GedRecord, parseGedcomFile } from "@/lib/gedcom";

export type PlannedPerson = {
    xref: string;
    surname: string;
    given: string;
    patronymic: string;
    sex: "male" | "female" | "unknown";
    birth: string;
    death: string;
    notes: string;
};

export type PlannedUnion = {
    xref: string;
    partners: string[];
    children: string[];
    marriage: string;
};

export type ImportPlan = {
    /** The GEDC.VERS of the header: "5.5", "5.5.1", "7.0" or "unknown". */
    version: string;
    persons: PlannedPerson[];
    unions: PlannedUnion[];
    warnings: { xref: string; message: string }[];
};

const MONTHS: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
};

const SINGLE_DATE = /^(?:(\d{1,2})\s+)?(?:([A-Za-z]{3})\s+)?(\d{4})$/;

/**
 * One GEDCOM date without a modifier, in the form the editor takes:
 * "27 JAN 1963" -> "1963-01-27"; "MAY 1963" -> "1963-05"; "1921" -> "1921".
 */
function singleDate(text: string): string | null {
    const match = SINGLE_DATE.exec(text.trim());
    if (!match) return null;
    const [, dayText, monthText, yearText] = match;
    if (monthText === undefined) return yearText ?? null;
    const month = MONTHS[monthText.toUpperCase()];
    if (!month) return null;
    if (dayText === undefined) return `${yearText}-${month}`;
    return `${yearText}-${month}-${dayText.padStart(2, "0")}`;
}

/**
 * A GEDCOM date as the person editor takes it, or null when it is not read.
 * The modifiers of GEDCOM 5.5.1 and 7.0 (DATE_APPROXIMATE, DATE_RANGE, DATE_PERIOD) map onto
 * the qualifiers of the editor, written with the first word of the current locale's list:
 *   ABT x          -> about x
 *   EST x          -> estimated x
 *   CAL x          -> calculated x
 *   BEF x          -> before x
 *   AFT x          -> after x
 *   BET x AND y    -> between x and y
 *   FROM x TO y    -> from x to y
 * Calendars (@#DJULIAN@ …), "FROM x" and "TO y" alone, and date phrases are not read.
 */
export function gedcomDateToInput(
    value: string,
    words: DateWords,
): { ok: true; input: string } | { ok: false } {
    const converted = convertGedcomDate(value, words);
    if (!converted.ok) return converted;
    // A date the editor would refuse (32 JAN, 30 FEB) is not read either: the import must
    // not stop on it later.
    return parseFuzzyDate(converted.input, words).ok ? converted : { ok: false };
}

function convertGedcomDate(
    value: string,
    words: DateWords,
): { ok: true; input: string } | { ok: false } {
    const text = value.trim().replace(/\s+/g, " ");
    if (text === "") return { ok: false };

    // The GEDCOM keywords are the format's grammar; the words written into the editor's form
    // are the locale's own.
    const word = (list: string[]) => list[0] ?? "";
    const modified: [RegExp, (parts: string[]) => string][] = [
        [/^BET (.+) AND (.+)$/i, ([a, b]) => `${word(words.between)} ${a} ${word(words.and)} ${b}`],
        [/^FROM (.+) TO (.+)$/i, ([a, b]) => `${word(words.from)} ${a} ${word(words.to)} ${b}`],
        [/^ABT (.+)$/i, ([a]) => `${word(words.about)} ${a}`],
        [/^EST (.+)$/i, ([a]) => `${word(words.estimated)} ${a}`],
        [/^CAL (.+)$/i, ([a]) => `${word(words.calculated)} ${a}`],
        [/^BEF (.+)$/i, ([a]) => `${word(words.before)} ${a}`],
        [/^AFT (.+)$/i, ([a]) => `${word(words.after)} ${a}`],
    ];

    for (const [pattern, build] of modified) {
        const match = pattern.exec(text);
        if (!match) continue;
        const parts = match.slice(1).map((part) => singleDate(part ?? ""));
        if (parts.some((part) => part === null)) return { ok: false };
        return { ok: true, input: build(parts as string[]) };
    }

    const plain = singleDate(text);
    return plain === null ? { ok: false } : { ok: true, input: plain };
}

/** The date of an event line and the phrase of the date (GEDCOM 7.0 keeps it in PHRASE). */
function dateOf(event: GedLine): { date: string; phrase: string } {
    const dateLine = child(event, "DATE");
    if (!dateLine) return { date: "", phrase: "" };
    return { date: dateLine.value, phrase: child(dateLine, "PHRASE")?.value ?? "" };
}

/** Splits a name into surname, given name and patronymic, with the file's own fields first. */
function splitName(record: GedRecord): {
    surname: string;
    given: string;
    patronymic: string;
    suffix: string;
} {
    const nameLine = child(record, "NAME");
    const givn = child(nameLine ?? record, "GIVN")?.value ?? "";
    const surn = child(nameLine ?? record, "SURN")?.value ?? "";
    const suffix = child(nameLine ?? record, "NSFX")?.value ?? "";

    let given = givn.trim();
    let surname = surn.trim();

    if (given === "" && surname === "" && nameLine) {
        // "Given /Surname/": the surname is between the slashes (the standard).
        const raw = nameLine.value;
        const slash = /\/([^/]*)\//.exec(raw);
        surname = (slash?.[1] ?? "").trim();
        given = raw.replace(/\/[^/]*\/.*$/, "").trim();
    }

    // The standard separates several given names with a comma (NAME_PIECE_GIVEN).
    // The MyHeritage export writes the patronymic after a space instead of in a separate tag.
    // Here the first word is the given name and the rest the patronymic. A comma-separated
    // list of given names is kept as it is.
    const words = given.split(/\s+/).filter(Boolean);
    const patronymic = words.length > 1 ? words.slice(1).join(" ") : "";
    const firstName = words[0] ?? "";

    return { surname, given: firstName, patronymic, suffix: suffix.trim() };
}

/** Strips the markup of a free text (<DSCR><HAIR>curly</HAIR></DSCR> -> "curly"). */
function plainText(value: string): string {
    return value
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** The messages of the planner, keyed as in the gedcom.plan namespace of the translation files. */
export type PlanKey =
    | "skippedLines"
    | "noName"
    | "suffixInFile"
    | "birthPhrase"
    | "birthDateInFile"
    | "birthDateNotRead"
    | "deathPhrase"
    | "deathDateInFile"
    | "deathDateNotRead"
    | "deathWithoutDate"
    | "unionWithoutPartners"
    | "marriageDateNotRead";

/** What the planner takes from the request: the words of the date parser and the translator. */
export type PlanContext = {
    words: DateWords;
    t: (key: PlanKey, values?: Record<string, string | number>) => string;
};

export function planImport(text: string, ctx: PlanContext): ImportPlan {
    const file = parseGedcomFile(text);
    const records = file.records;
    const warnings: ImportPlan["warnings"] = [];
    const persons: PlannedPerson[] = [];
    const unions: PlannedUnion[] = [];

    if (file.skippedLines > 0) {
        warnings.push({
            xref: "file",
            message: ctx.t("skippedLines", { count: file.skippedLines }),
        });
    }

    for (const record of records) {
        if (record.tag !== "INDI" || !record.xref) continue;
        const xref = record.xref;
        const { surname, given, patronymic, suffix } = splitName(record);

        if (surname === "" && given === "") {
            warnings.push({ xref, message: ctx.t("noName") });
            continue;
        }

        const notes: string[] = [];
        if (suffix) notes.push(ctx.t("suffixInFile", { suffix }));
        const dscr = child(record, "DSCR");
        if (dscr) {
            const description = plainText(dscr.value);
            if (description) notes.push(description);
        }

        let birth = "";
        const birt = child(record, "BIRT");
        if (birt) {
            const { date, phrase } = dateOf(birt);
            if (phrase) notes.push(ctx.t("birthPhrase", { phrase }));
            if (date) {
                const read = gedcomDateToInput(date, ctx.words);
                if (read.ok) {
                    birth = read.input;
                } else {
                    notes.push(ctx.t("birthDateInFile", { date }));
                    warnings.push({ xref, message: ctx.t("birthDateNotRead", { date }) });
                }
            }
        }

        let death = "";
        const deat = child(record, "DEAT");
        if (deat) {
            const { date, phrase } = dateOf(deat);
            if (phrase) notes.push(ctx.t("deathPhrase", { phrase }));
            if (date) {
                const read = gedcomDateToInput(date, ctx.words);
                if (read.ok) {
                    death = read.input;
                } else {
                    notes.push(ctx.t("deathDateInFile", { date }));
                    warnings.push({ xref, message: ctx.t("deathDateNotRead", { date }) });
                }
            } else {
                warnings.push({ xref, message: ctx.t("deathWithoutDate") });
            }
        }

        // M and F are the sexes. X (intersex, 7.0) and U are not known sexes for the archive,
        // so both are read as unknown.
        const sexValue = child(record, "SEX")?.value.trim().toUpperCase() ?? "U";
        const sex = sexValue === "M" ? "male" : sexValue === "F" ? "female" : "unknown";

        persons.push({
            xref,
            surname,
            given,
            patronymic,
            sex,
            birth,
            death,
            notes: notes.join("\n"),
        });
    }

    const importable = new Set(persons.map((person) => person.xref));

    for (const record of records) {
        if (record.tag !== "FAM" || !record.xref) continue;
        const husband = child(record, "HUSB")?.value ?? "";
        const wife = child(record, "WIFE")?.value ?? "";
        const partners = [husband, wife].filter((ref) => importable.has(ref));
        const children = childrenOf(record, "CHIL")
            .map((line) => line.value)
            .filter((ref) => importable.has(ref));

        if (partners.length === 0 && children.length === 0) {
            warnings.push({
                xref: record.xref,
                message: ctx.t("unionWithoutPartners"),
            });
            continue;
        }

        let marriage = "";
        const marr = child(record, "MARR");
        if (marr) {
            const { date } = dateOf(marr);
            if (date) {
                const read = gedcomDateToInput(date, ctx.words);
                if (read.ok) {
                    marriage = read.input;
                } else {
                    warnings.push({
                        xref: record.xref,
                        message: ctx.t("marriageDateNotRead", { date }),
                    });
                }
            }
        }

        unions.push({ xref: record.xref, partners, children, marriage });
    }

    return { version: file.version, persons, unions, warnings };
}
