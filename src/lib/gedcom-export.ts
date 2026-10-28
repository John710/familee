/**
 * Familee - writing a GEDCOM 7.0 file (the current FamilySearch standard)
 *
 * Pure: the caller passes the persons and the unions of a tree; this module only
 * writes the text. Rules from GEDCOM 7.0 (gedcom.io, FamilySearch):
 *   - the header starts with HEAD / GEDC / VERS 7.0; the text is UTF-8 and has no CHAR;
 *   - a line is "level [xref] tag [value]" with single spaces; a value that starts with
 *     "@" doubles that one "@"; a line break inside a value is a CONT line (never CONC);
 *   - dates: [calendar] [day] month year, with the modifiers ABT, CAL, EST, BEF, AFT,
 *     BET x AND y, FROM x TO y;
 *   - the sex is M, F, X (intersex) or U; NAME is "Given /Surname/ Suffix" with GIVN,
 *     SURN and NSFX;
 *   - a FAM names its partners with HUSB and WIFE, one of each at most, and the spec says
 *     the sex must not be inferred from the tag: two partners of one sex are HUSB and WIFE.
 *
 * The given name and the patronymic go into GIVN as "given patronymic" (the way the
 * MyHeritage export writes them and the import reads them back), so the round trip keeps
 * the patronymic as long as it reads as one (src/lib/gedcom-plan.ts, PATRONYMIC).
 */

export type GedDate = {
    qualifier:
        | "exact"
        | "about"
        | "estimated"
        | "calculated"
        | "before"
        | "after"
        | "between"
        | "from_to";
    precision: "day" | "month" | "year";
    start: string;
    end: string | null;
};

/**
 * An event other than the birth and the death. `tag` is its GEDCOM tag ("OCCU", "RESI"...);
 * an event type without one is written as EVEN with the type code in TYPE.
 */
export type ExportEvent = {
    tag: string | null;
    typeCode: string;
    value: string | null;
    description: string;
    date: GedDate | null;
};

export type ExportPerson = {
    xref: string;
    surname: string;
    given: string;
    patronymic: string;
    /** "Jr.", "III": NSFX, and after the surname in NAME. */
    suffix: string;
    sex: "male" | "female" | "unknown";
    birth: GedDate | null;
    death: GedDate | null;
    notes: string;
    events: ExportEvent[];
};

export type ExportUnion = {
    xref: string;
    /** The partners in their order in the union; partnerTags() gives each one HUSB or WIFE. */
    partners: { xref: string; sex: ExportPerson["sex"] }[];
    children: string[];
    /** Every marriage event of the union, the primary one first; a marriage may have no date. */
    marriages: { date: GedDate | null; description: string }[];
};

const MONTH_NAMES = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
];

/** A single date in GEDCOM form, at the precision it was entered with. */
export function gedcomSingle(iso: string, precision: GedDate["precision"]): string {
    const [year = "", month = "", day = ""] = iso.split("-");
    if (precision === "year") return year;
    const monthName = MONTH_NAMES[Number(month) - 1] ?? "";
    if (precision === "month") return `${monthName} ${year}`;
    return `${Number(day)} ${monthName} ${year}`;
}

/** The DATE value of a stored date, with its modifier. */
export function gedcomDate(date: GedDate): string {
    const start = gedcomSingle(date.start, date.precision);
    const end = date.end ? gedcomSingle(date.end, date.precision) : null;
    switch (date.qualifier) {
        case "exact":
            return start;
        case "about":
            return `ABT ${start}`;
        case "estimated":
            return `EST ${start}`;
        case "calculated":
            return `CAL ${start}`;
        case "before":
            return `BEF ${start}`;
        case "after":
            return `AFT ${start}`;
        case "between":
            return end ? `BET ${start} AND ${end}` : `BET ${start}`;
        case "from_to":
            return end ? `FROM ${start} TO ${end}` : `FROM ${start}`;
    }
}

type Line = { level: number; xref?: string; tag: string; value?: string };

/** A value with line breaks: the first line is the value, the rest are CONT lines. */
function textLines(level: number, tag: string, text: string): Line[] {
    const [first = "", ...rest] = text.split("\n");
    const lines: Line[] = [{ level, tag, value: escapeValue(first) }];
    for (const more of rest) {
        lines.push({ level: level + 1, tag: "CONT", value: escapeValue(more) });
    }
    return lines;
}

/**
 * HUSB or WIFE for each partner, each tag once (GEDCOM 7.0 allows one of each). A man takes HUSB
 * and a woman WIFE where the other partner leaves that tag free; two partners of one sex, or of
 * unknown sex, take HUSB and WIFE in their order, so the importer reads both back in that order.
 * A third partner has no tag left and is not written.
 */
export function partnerTags(sexes: ExportPerson["sex"][]): ("HUSB" | "WIFE" | null)[] {
    const [first, second] = sexes;
    if (first === undefined) return [];
    if (second === undefined) return [first === "female" ? "WIFE" : "HUSB"];
    const swap =
        (first !== "male" && second === "male") || (first === "female" && second !== "female");
    const pair: ("HUSB" | "WIFE")[] = swap ? ["WIFE", "HUSB"] : ["HUSB", "WIFE"];
    return sexes.map((_sex, index) => pair[index] ?? null);
}

/** A value that starts with "@" writes it doubled; nothing else changes in 7.0. */
function escapeValue(value: string): string {
    return value.startsWith("@") ? `@${value}` : value;
}

function render(lines: Line[]): string {
    return lines
        .map((line) => {
            const parts = [String(line.level)];
            if (line.xref) parts.push(line.xref);
            parts.push(line.tag);
            if (line.value !== undefined && line.value !== "") parts.push(line.value);
            return parts.join(" ");
        })
        .join("\n");
}

export function writeGedcom7(input: {
    persons: ExportPerson[];
    unions: ExportUnion[];
    /** The name of the program that writes the file, for the SOUR record of the header. */
    sourceName: string;
    sourceVersion: string;
}): string {
    const lines: Line[] = [
        { level: 0, tag: "HEAD" },
        { level: 1, tag: "GEDC" },
        { level: 2, tag: "VERS", value: "7.0" },
        { level: 1, tag: "SOUR", value: input.sourceName },
        { level: 2, tag: "VERS", value: input.sourceVersion },
    ];

    const familiesOf = new Map<string, string[]>();
    const familyOfChild = new Map<string, string[]>();
    for (const union of input.unions) {
        for (const partner of union.partners) {
            familiesOf.set(partner.xref, [...(familiesOf.get(partner.xref) ?? []), union.xref]);
        }
        for (const child of union.children) {
            familyOfChild.set(child, [...(familyOfChild.get(child) ?? []), union.xref]);
        }
    }

    for (const person of input.persons) {
        const given = [person.given, person.patronymic].filter((part) => part !== "").join(" ");
        const name = `${given} /${person.surname}/ ${person.suffix}`.trim();
        lines.push({ level: 0, xref: person.xref, tag: "INDI" });
        lines.push({ level: 1, tag: "NAME", value: escapeValue(name) });
        if (given) lines.push({ level: 2, tag: "GIVN", value: escapeValue(given) });
        if (person.surname)
            lines.push({ level: 2, tag: "SURN", value: escapeValue(person.surname) });
        if (person.suffix) {
            lines.push({ level: 2, tag: "NSFX", value: escapeValue(person.suffix) });
        }
        lines.push({ level: 1, tag: "SEX", value: sexCode(person.sex) });

        if (person.birth) {
            lines.push({ level: 1, tag: "BIRT" });
            lines.push({ level: 2, tag: "DATE", value: gedcomDate(person.birth) });
        }
        if (person.death) {
            lines.push({ level: 1, tag: "DEAT" });
            lines.push({ level: 2, tag: "DATE", value: gedcomDate(person.death) });
        }
        for (const event of person.events) {
            // A value may hold line breaks (an occupation written over two lines): the rest
            // of it goes into CONT lines, a raw break would end the GEDCOM line.
            lines.push(...textLines(1, event.tag ?? "EVEN", event.value ?? ""));
            if (!event.tag) {
                lines.push({ level: 2, tag: "TYPE", value: escapeValue(event.typeCode) });
            }
            if (event.date) lines.push({ level: 2, tag: "DATE", value: gedcomDate(event.date) });
            if (event.description) lines.push(...textLines(2, "NOTE", event.description));
        }
        if (person.notes) lines.push(...textLines(1, "NOTE", person.notes));

        for (const family of familiesOf.get(person.xref) ?? []) {
            lines.push({ level: 1, tag: "FAMS", value: family });
        }
        for (const family of familyOfChild.get(person.xref) ?? []) {
            lines.push({ level: 1, tag: "FAMC", value: family });
        }
    }

    for (const union of input.unions) {
        lines.push({ level: 0, xref: union.xref, tag: "FAM" });
        const tags = partnerTags(union.partners.map((partner) => partner.sex));
        union.partners.forEach((partner, index) => {
            const tag = tags[index];
            if (tag) lines.push({ level: 1, tag, value: partner.xref });
        });
        for (const child of union.children) {
            lines.push({ level: 1, tag: "CHIL", value: child });
        }
        for (const marriage of union.marriages) {
            if (marriage.date) {
                lines.push({ level: 1, tag: "MARR" });
                lines.push({ level: 2, tag: "DATE", value: gedcomDate(marriage.date) });
            } else {
                // "Y": the marriage took place, the date is not known (GEDCOM 7.0, events).
                lines.push({ level: 1, tag: "MARR", value: "Y" });
            }
            if (marriage.description) lines.push(...textLines(2, "NOTE", marriage.description));
        }
    }

    lines.push({ level: 0, tag: "TRLR" });
    return `${render(lines)}\n`;
}

function sexCode(sex: ExportPerson["sex"]): string {
    return sex === "male" ? "M" : sex === "female" ? "F" : "U";
}
