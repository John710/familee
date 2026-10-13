/**
 * Familee - reading dates as people write them
 *
 * A date in the archive can be exact or partial: "12.04.1921", "1921-04-12",
 * "1921-04", "1921", or approximate: "c. 1920" / "ок. 1920". The parser turns the
 * text into the columns of familee.events: a qualifier, a precision and the start
 * and end of the period. The original text is kept as date_original, so the
 * record always shows what was written.
 *
 * Only the gregorian calendar is read here (see the calendar column for the rest).
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

const ABOUT = "(?:(c\\.|ок\\.|about|около)\\s*)?";

/** 1921, 1921-04, 1921-04-12 (the month and the day may be one digit). */
const ISO = new RegExp(`^${ABOUT}(\\d{4})(?:-(\\d{1,2})(?:-(\\d{1,2}))?)?$`, "i");

/** Russian dotted form: 12.04.1921 (day.month.year) and 04.1921 (month.year). */
const DOTTED_DAY = new RegExp(`^${ABOUT}(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})$`, "i");
const DOTTED_MONTH = new RegExp(`^${ABOUT}(\\d{1,2})\\.(\\d{4})$`, "i");

/** Empty input means "no date" and is not an error. */
export function parseFuzzyDate(raw: string): DateParseResult {
    const original = raw.trim();
    if (original === "") return { ok: true, value: null };

    const dotted = DOTTED_DAY.exec(original);
    if (dotted) {
        const [, about, day, month, year] = dotted;
        return day_(original, about, year, month, day);
    }

    const dottedMonth = DOTTED_MONTH.exec(original);
    if (dottedMonth) {
        const [, about, month, year] = dottedMonth;
        return month_(original, about, year, month);
    }

    const iso = ISO.exec(original);
    if (!iso) return { ok: false, error: "validation.invalidDate" };

    const [, about, year, month, day] = iso;
    if (month === undefined) return year_(original, about, year);
    if (day === undefined) return month_(original, about, year, month);
    return day_(original, about, year, month, day);
}

function year_(
    original: string,
    about: string | undefined,
    yearText: string | undefined,
): DateParseResult {
    const year = Number(yearText);
    if (!Number.isInteger(year) || year < 1) return invalid();
    return {
        ok: true,
        value: {
            qualifier: qualifierOf(about),
            precision: "year",
            dateStart: iso(year, 1, 1),
            dateEnd: iso(year, 12, 31),
            original,
        },
    };
}

function month_(
    original: string,
    about: string | undefined,
    yearText: string | undefined,
    monthText: string | undefined,
): DateParseResult {
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(month)) return invalid();
    if (year < 1 || month < 1 || month > 12) return invalid();
    return {
        ok: true,
        value: {
            qualifier: qualifierOf(about),
            precision: "month",
            dateStart: iso(year, month, 1),
            dateEnd: iso(year, month, daysInMonth(year, month)),
            original,
        },
    };
}

function day_(
    original: string,
    about: string | undefined,
    yearText: string | undefined,
    monthText: string | undefined,
    dayText: string | undefined,
): DateParseResult {
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (![year, month, day].every(Number.isInteger)) return invalid();
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
        return invalid();
    }
    return {
        ok: true,
        value: {
            qualifier: qualifierOf(about),
            precision: "day",
            dateStart: iso(year, month, day),
            dateEnd: null,
            original,
        },
    };
}

function qualifierOf(about: string | undefined): "exact" | "about" {
    return about ? "about" : "exact";
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
