/**
 * Familee - the plan of a GEDCOM import (nothing is written here)
 *
 * Takes the records from src/lib/gedcom.ts and says what the import would create:
 * persons with their names, sex and life dates, unions with partners and children.
 * Dates are turned into the form the person editor accepts ("1963-01-27",
 * "1963-05", "1921", "ок. 1920"); everything that cannot be read stays in the notes
 * and is listed as a warning.
 */

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

const GEDCOM_DATE = /^(?:(ABT|EST|CAL)\s+)?(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{4})$/i;

/**
 * A GEDCOM date as the person editor takes it, or null with the reason.
 * "27 JAN 1963" -> "1963-01-27"; "MAY 1963" -> "1963-05"; "1921" -> "1921";
 * "ABT 1920" -> "ок. 1920". BEF, AFT, BET and the rest are not read.
 */
export function gedcomDateToInput(value: string): { ok: true; input: string } | { ok: false } {
    const text = value.trim().replace(/\s+/g, " ");
    if (text === "") return { ok: false };

    const match = GEDCOM_DATE.exec(text);
    if (!match) return { ok: false };

    const [, approx, dayText, monthText, yearText] = match;
    const prefix = approx ? "ок. " : "";

    if (monthText === undefined) {
        return { ok: true, input: `${prefix}${yearText}` };
    }
    const month = MONTHS[monthText.toUpperCase()];
    if (!month) return { ok: false };

    if (dayText === undefined) {
        return { ok: true, input: `${prefix}${yearText}-${month}` };
    }
    return {
        ok: true,
        input: `${prefix}${yearText}-${month}-${dayText.padStart(2, "0")}`,
    };
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

    // Two words in the given name: the first is the given name, the rest the patronymic
    // ("Сергей Михайлович"). This is how the file writes the patronymic.
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
