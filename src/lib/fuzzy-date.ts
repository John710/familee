/**
 * Familee - reading dates as people write them
 *
 * A date in the archive can be exact, partial, approximate or a range, and the
 * database keeps each case with its qualifier (familee.events.date_qualifier):
 *
 *   12.04.1921 · 1921-04-12   exact day
 *   04.1921 · 1921-04         exact month
 *   1921                      exact year
 *   ок. 1921 · c. 1921        about              (GEDCOM ABT)
 *   оц. 1921                  estimated          (GEDCOM EST)
 *   выч. 1921                 calculated         (GEDCOM CAL)
 *   до 1921                   before             (GEDCOM BEF)
 *   после 1921                after              (GEDCOM AFT)
 *   между 1915 и 1918         between            (GEDCOM BET … AND)
 *   с 1915 по 1918            from_to            (GEDCOM FROM … TO)
 *   1915 – 1918               between (a range with spaces around the dash)
 *
 * The original text is kept as date_original, so the record shows what was written.
 * Only the gregorian calendar is read here (see the calendar column for the rest).
 */

export type DateQualifier =
    | "exact"
    | "about"
    | "estimated"
    | "calculated"
    | "before"
    | "after"
    | "between"
    | "from_to";

export type ParsedDate = {
    qualifier: DateQualifier;
    precision: "day" | "month" | "year";
    dateStart: string;
    /** null when the period has no end; the last day of a month or a year otherwise. */
    dateEnd: string | null;
    original: string;
};

export type DateParseResult = { ok: true; value: ParsedDate | null } | { ok: false; error: string };

/** One date, read on its own: the first and the last day of the period it names. */
type Single = { precision: "day" | "month" | "year"; start: string; end: string | null };

const ISO = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;
const DOTTED_DAY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const DOTTED_MONTH = /^(\d{1,2})\.(\d{4})$/;

/** Empty input means "no date" and is not an error. */
export function parseFuzzyDate(raw: string): DateParseResult {
    const original = raw.trim().replace(/\s+/g, " ");
    if (original === "") return { ok: true, value: null };

    // Ranges first: "между … и …", "с … по …", "… – …" (spaces around the dash, so that
    // the dashes of ISO dates are not taken for a range).
    const between = /^(?:между|between) (.+?) (?:и|and) (.+)$/i.exec(original);
    if (between) return range("between", original, between[1] ?? "", between[2] ?? "");

    const fromTo = /^(?:с|from) (.+?) (?:по|to) (.+)$/i.exec(original);
    if (fromTo) return range("from_to", original, fromTo[1] ?? "", fromTo[2] ?? "");

    const dash = /^(.+) [–-] (.+)$/.exec(original);
    if (dash) return range("between", original, dash[1] ?? "", dash[2] ?? "");

    // Qualifiers in front of one date. The Latin forms are the GEDCOM words.
    // The longer word goes first ("calc" before "cal", "около" before "c"), and the dot is optional.
    const qualified: [RegExp, DateQualifier][] = [
        [/^(?:до|bef|before) (.+)$/i, "before"],
        [/^(?:после|aft|after) (.+)$/i, "after"],
        [/^(?:оц|est)\.? ?(.+)$/i, "estimated"],
        [/^(?:выч|calc|cal)\.? ?(.+)$/i, "calculated"],
        [/^(?:около|about|abt|ок|c)\.? ?(.+)$/i, "about"],
    ];
    for (const [pattern, qualifier] of qualified) {
        const match = pattern.exec(original);
        if (match) {
            const single = readSingle(match[1] ?? "");
            if (!single) return invalid();
            return {
                ok: true,
                value: {
                    qualifier,
                    precision: single.precision,
                    dateStart: single.start,
                    dateEnd: qualifier === "before" || qualifier === "after" ? null : single.end,
                    original,
                },
            };
        }
    }

    const single = readSingle(original);
    if (!single) return invalid();
    return {
        ok: true,
        value: {
            qualifier: "exact",
            precision: single.precision,
            dateStart: single.start,
            dateEnd: single.end,
            original,
        },
    };
}

function range(
    qualifier: "between" | "from_to",
    original: string,
    fromText: string,
    toText: string,
): DateParseResult {
    const from = readSingle(fromText);
    const to = readSingle(toText);
    if (!from || !to) return invalid();
    if (to.end !== null ? to.end < from.start : to.start < from.start) return invalid();

    // The coarser of the two precisions describes the whole period.
    const precision = [from.precision, to.precision].includes("year")
        ? "year"
        : [from.precision, to.precision].includes("month")
          ? "month"
          : "day";

    return {
        ok: true,
        value: {
            qualifier,
            precision,
            dateStart: from.start,
            dateEnd: to.end ?? to.start,
            original,
        },
    };
}

/** One date without any qualifier: 1921, 1921-04, 1921-04-12, 04.1921 or 12.04.1921. */
function readSingle(text: string): Single | null {
    // Russian sources write the year with its word: "около 1901 года", "1901 г.".
    const value = text.trim().replace(/\s*(?:года|год|г\.?)$/i, "");

    const dotted = DOTTED_DAY.exec(value);
    if (dotted) {
        const [, day, month, year] = dotted;
        return day_(year, month, day);
    }
    const dottedMonth = DOTTED_MONTH.exec(value);
    if (dottedMonth) {
        const [, month, year] = dottedMonth;
        return month_(year, month);
    }

    const iso = ISO.exec(value);
    if (!iso) return null;
    const [, year, month, day] = iso;
    if (month === undefined) return year_(year);
    if (day === undefined) return month_(year, month);
    return day_(year, month, day);
}

function year_(yearText: string | undefined): Single | null {
    const year = Number(yearText);
    if (!Number.isInteger(year) || year < 1) return null;
    return { precision: "year", start: iso(year, 1, 1), end: iso(year, 12, 31) };
}

function month_(yearText: string | undefined, monthText: string | undefined): Single | null {
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
    if (year < 1 || month < 1 || month > 12) return null;
    return {
        precision: "month",
        start: iso(year, month, 1),
        end: iso(year, month, daysInMonth(year, month)),
    };
}

function day_(
    yearText: string | undefined,
    monthText: string | undefined,
    dayText: string | undefined,
): Single | null {
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (![year, month, day].every(Number.isInteger)) return null;
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
        return null;
    }
    return { precision: "day", start: iso(year, month, day), end: null };
}

function invalid(): DateParseResult {
    return { ok: false, error: "validation.invalidDate" };
}

function daysInMonth(year: number, month: number): number {
    // Day 0 of the next month is the last day of this one.
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
