/**
 * Familee - the plan of a GEDCOM import (nothing is written here)
 *
 * Takes the records from src/lib/gedcom.ts and says what the import would create:
 * persons with their names, sex and life dates, unions with partners and children.
 * Dates are turned into the form the person editor accepts ("1963-01-27",
 * "1963-05", "1921", "ок. 1920"); everything that cannot be read stays in the notes
 * and is listed as a warning.
 */

import { parseFuzzyDate } from "@/lib/fuzzy-date";
import { child, childrenOf, type GedRecord, parseGedcom } from "@/lib/gedcom";

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
    persons: PlannedPerson[];
    unions: PlannedUnion[];
    warnings: { xref: string; message: string }[];
};

const MONTHS: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
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
 * The modifiers of the GEDCOM standard (5.4 and 5.5, DATE_APPROXIMATE and
 * DATE_RANGE / DATE_PERIOD) map onto the qualifiers of the editor:
 *   ABT x          -> ок. x      (about)
 *   EST x          -> оц. x      (estimated)
 *   CAL x          -> выч. x     (calculated)
 *   BEF x          -> до x       (before)
 *   AFT x          -> после x    (after)
 *   BET x AND y    -> между x и y (between)
 *   FROM x TO y    -> с x по y   (from_to)
 * A date phrase in brackets, "(…)", is not a date and is not read.
 */
export function gedcomDateToInput(value: string): { ok: true; input: string } | { ok: false } {
    const converted = convertGedcomDate(value);
    if (!converted.ok) return converted;
    // A date the editor would refuse (32 JAN, 30 FEB) is not read either: the import must
    // not stop on it later.
    return parseFuzzyDate(converted.input).ok ? converted : { ok: false };
}

function convertGedcomDate(value: string): { ok: true; input: string } | { ok: false } {
    const text = value.trim().replace(/\s+/g, " ");
    if (text === "") return { ok: false };

    const modified: [RegExp, (parts: string[]) => string][] = [
        [/^BET (.+) AND (.+)$/i, ([a, b]) => `между ${a} и ${b}`],
        [/^FROM (.+) TO (.+)$/i, ([a, b]) => `с ${a} по ${b}`],
        [/^ABT (.+)$/i, ([a]) => `ок. ${a}`],
        [/^EST (.+)$/i, ([a]) => `оц. ${a}`],
        [/^CAL (.+)$/i, ([a]) => `выч. ${a}`],
        [/^BEF (.+)$/i, ([a]) => `до ${a}`],
        [/^AFT (.+)$/i, ([a]) => `после ${a}`],
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

/** Splits a name into surname, given name and patronymic, with the file's own fields first. */
function splitName(record: GedRecord): { surname: string; given: string; patronymic: string; suffix: string } {
    const nameLine = child(record, "NAME");
    const givn = child(nameLine ?? record, "GIVN")?.value ?? "";
    const surn = child(nameLine ?? record, "SURN")?.value ?? "";
    const suffix = child(nameLine ?? record, "NSFX")?.value ?? "";

    let given = givn.trim();
    let surname = surn.trim();

    if (given === "" && surname === "" && nameLine) {
        // "Given /Surname/": the surname is between the slashes.
        const raw = nameLine.value;
        const slash = /\/([^/]*)\//.exec(raw);
        surname = (slash?.[1] ?? "").trim();
        given = raw.replace(/\/[^/]*\/.*$/, "").trim();
    }

    // The standard separates several given names with a comma (GEDCOM 5.4, NAME_PIECE_GIVEN).
    // The MyHeritage export writes the patronymic after a space instead: "Сергей Михайлович".
    // Here the first word is the given name and the rest the patronymic. Other programs
    // may write a comma-separated list, which is kept as a single given name.
    const words = given.split(/\s+/).filter(Boolean);
    const patronymic = words.length > 1 ? words.slice(1).join(" ") : "";
    const firstName = words[0] ?? "";

    return { surname, given: firstName, patronymic, suffix: suffix.trim() };
}

/** Strips the markup of a free text (<DSCR><HAIR>Кудрявый</HAIR></DSCR> -> "Кудрявый"). */
function plainText(value: string): string {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function planImport(text: string): ImportPlan {
    const records = parseGedcom(text);
    const warnings: ImportPlan["warnings"] = [];
    const persons: PlannedPerson[] = [];
    const unions: PlannedUnion[] = [];

    for (const record of records) {
        if (record.tag !== "INDI" || !record.xref) continue;
        const xref = record.xref;
        const { surname, given, patronymic, suffix } = splitName(record);

        if (surname === "" && given === "") {
            warnings.push({ xref, message: "no name in the file: the person is not imported" });
            continue;
        }

        const notes: string[] = [];
        if (suffix) notes.push(`суффикс в файле: ${suffix}`);
        const dscr = child(record, "DSCR");
        if (dscr) {
            const description = plainText(dscr.value);
            if (description) notes.push(description);
        }

        const birt = child(record, "BIRT");
        let birth = "";
        const birthDate = birt ? child(birt, "DATE")?.value ?? "" : "";
        if (birthDate) {
            const read = gedcomDateToInput(birthDate);
            if (read.ok) {
                birth = read.input;
            } else {
                notes.push(`дата рождения в файле: ${birthDate}`);
                warnings.push({ xref, message: `birth date not read: ${birthDate}` });
            }
        }

        const deat = child(record, "DEAT");
        let death = "";
        if (deat) {
            const deathDate = child(deat, "DATE")?.value ?? "";
            if (deathDate) {
                const read = gedcomDateToInput(deathDate);
                if (read.ok) {
                    death = read.input;
                } else {
                    notes.push(`дата смерти в файле: ${deathDate}`);
                    warnings.push({ xref, message: `death date not read: ${deathDate}` });
                }
            } else {
                warnings.push({ xref, message: "death without a date: the person is not marked deceased" });
            }
        }

        const sexValue = child(record, "SEX")?.value ?? "U";
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
            warnings.push({ xref: record.xref, message: "union without imported partners or children" });
            continue;
        }

        const marr = child(record, "MARR");
        const marriageDate = marr ? child(marr, "DATE")?.value ?? "" : "";
        let marriage = "";
        if (marriageDate) {
            const read = gedcomDateToInput(marriageDate);
            if (read.ok) {
                marriage = read.input;
            } else {
                warnings.push({ xref: record.xref, message: `marriage date not read: ${marriageDate}` });
            }
        }

        unions.push({ xref: record.xref, partners, children, marriage });
    }

    return { persons, unions, warnings };
}

export { parseGedcom };
