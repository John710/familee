/**
 * Familee - reading dates as people write them
 *
 * A date in the archive can be exact or partial: "12.04.1921", "1921-04", "1921",
 * or approximate: "c. 1920" / "ок. 1920". The parser turns the text into the
 * columns of familee.events: a qualifier, a precision and the start and end of the
 * period. The original text is kept as date_original, so the record always shows
 * what was written.
 *
 * No calendar conversion here: the gregorian calendar only (see the calendar
 * column for the rest).
 */

export type ParsedDate = {
    qualifier: "exact" | "about";
    precision: "day" | "month" | "year";
    dateStart: string;
    /** null for an exact day; the last day of the period for a month or a year. */
    dateEnd: string | null;
    original: string;
};

export type DateParseResult = { ok: true; value: ParsedDate | null } | { ok: false; error: string };

const PATTERN = /^(?:(c\.|ок\.|about|около)\s*)?(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/i;

/** Empty input means "no date" and is not an error. */
export function parseFuzzyDate(raw: string): DateParseResult {
    const original = raw.trim();
    if (original === "") return { ok: true, value: null };

    const match = PATTERN.exec(original);
    if (!match) return { ok: false, error: "validation.invalidDate" };

    const [, about, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const qualifier = about ? "about" : "exact";

    if (year < 1 || year > 9999) return { ok: false, error: "validation.invalidDate" };

    if (monthText === undefined) {
        return {
            ok: true,
            value: {
                qualifier,
                precision: "year",
                dateStart: iso(year, 1, 1),
                dateEnd: iso(year, 12, daysInMonth(year, 12)),
                original,
            },
        };
    }

    const month = Number(monthText);
    if (month < 1 || month > 12) return { ok: false, error: "validation.invalidDate" };

    if (dayText === undefined) {
        return {
            ok: true,
            value: {
                qualifier,
                precision: "month",
                dateStart: iso(year, month, 1),
                dateEnd: iso(year, month, daysInMonth(year, month)),
                original,
            },
        };
    }

    const day = Number(dayText);
    if (day < 1 || day > daysInMonth(year, month)) {
        return { ok: false, error: "validation.invalidDate" };
    }

    return {
        ok: true,
        value: {
            qualifier,
            precision: "day",
            dateStart: iso(year, month, day),
            dateEnd: null,
            original,
        },
    };
}

function daysInMonth(year: number, month: number): number {
    // Day 0 of the next month is the last day of this one.
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
