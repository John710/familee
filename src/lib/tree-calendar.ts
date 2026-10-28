/**
 * Familee - the days of a tree's calendar
 *
 * Pure functions, no database and no translations: the caller reads the persons and the events of
 * one tree, says what each one is called, and hands the anniversaries over. A birthday or a wedding
 * comes round on the same day every year, so an entry keeps the year it happened in, and the grid
 * of any month is built from the same list: an event of 1890 stands in the calendar of today.
 */

import { MAX_BIRTHDAY_AGE } from "@/lib/age";

/** An anniversary: it comes round on the same day every year. */
export type Anniversary = {
    /** The same on every build, so a list keeps its rows when the month changes. */
    key: string;
    /** Its day, as "MM-DD". */
    monthDay: string;
    /** The year it happened (the year of the birth, or of the event); null when nobody recorded it. */
    year: number | null;
    /** A birthday is drawn with a cake; everything else carries its own event type. */
    kind: "birthday" | "event";
    /** The event type code ("birth", "marriage", "death"...), for the label. */
    typeCode: string;
    /** What the day shows: the person, or the names of the partners of a union. */
    title: string;
    /** The card behind the entry, or null when it belongs to nobody in particular. */
    href: string | null;
    /** For a birthday: whether the person is alive, so the age is not counted for the dead. */
    living: boolean | null;
};

/** One day of the month, or a blank in the first and the last week. */
export type CalendarCell = {
    /** "YYYY-MM-DD" of the day; null in a blank. */
    date: string | null;
    /** The day of the month; null in a blank. */
    day: number | null;
    /** The anniversaries of that day: birthdays first, then by the year they happened. */
    entries: Anniversary[];
};

/** The number of days in a month; January is 0, as it is everywhere in JavaScript. */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** How many years an anniversary reaches in the given year; null when its own year is unknown. */
export function yearsSince(entry: Anniversary, year: number): number | null {
    return entry.year === null ? null : year - entry.year;
}

/** The day of the month an anniversary falls on: the 29th of February has no place elsewhere. */
function dayOf(entry: Anniversary, month: number, length: number): number | null {
    const [entryMonth = 0, entryDay = 0] = entry.monthDay.split("-").map(Number);
    if (entryMonth !== month + 1) return null;
    if (entryDay === 29 && entryMonth === 2 && length === 28) return 28;
    return entryDay >= 1 && entryDay <= length ? entryDay : null;
}

/** Birthdays first, then the older event first, and the undated last. */
function compare(a: Anniversary, b: Anniversary): number {
    if (a.kind !== b.kind) return a.kind === "birthday" ? -1 : 1;
    if (a.year !== b.year) {
        if (a.year === null) return 1;
        if (b.year === null) return -1;
        return a.year - b.year;
    }
    return a.title.localeCompare(b.title);
}

/**
 * One month as the cells of a calendar, Monday first, with the blanks that align the first and the
 * last week. Nothing is dropped: a day with four birthdays carries all four.
 *
 * The year is the year looked at: an anniversary stands on its day of that month from the year it
 * happened on, so the calendar of 1920 holds what a family of 1920 knew, and the one of today holds
 * all of it as anniversaries. A birthday of somebody born later is not written before they were
 * born, and an age is never counted backwards.
 */
export function buildMonth(
    anniversaries: Anniversary[],
    year: number,
    month: number,
): CalendarCell[] {
    const length = daysInMonth(year, month);
    const byDay = new Map<number, Anniversary[]>();
    for (const entry of anniversaries) {
        if (entry.year !== null && entry.year > year) continue;
        // A person with no death date is living, so an old tree would "turn 176": nobody is
        // announced who would be older than the limit. The dead keep their day without an age.
        if (
            entry.kind === "birthday" &&
            entry.living !== false &&
            entry.year !== null &&
            year - entry.year > MAX_BIRTHDAY_AGE
        ) {
            continue;
        }
        const day = dayOf(entry, month, length);
        if (day === null) continue;
        byDay.set(day, [...(byDay.get(day) ?? []), entry]);
    }

    // The blank cells before the first day: Monday is the first column, Sunday the last.
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const cells: CalendarCell[] = [];
    for (let index = 0; index < (firstWeekday + 6) % 7; index++) {
        cells.push({ date: null, day: null, entries: [] });
    }

    for (let day = 1; day <= length; day++) {
        const entries = (byDay.get(day) ?? []).slice().sort(compare);
        const pad = (value: number) => String(value).padStart(2, "0");
        const date = `${String(year).padStart(4, "0")}-${pad(month + 1)}-${pad(day)}`;
        cells.push({ date, day, entries });
    }

    // The blanks after the last day, so that every week has seven cells.
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null, entries: [] });
    return cells;
}
