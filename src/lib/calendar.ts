/**
 * Familee - the calendar of a tree, written as iCalendar (RFC 5545)
 *
 * Pure functions, no database and no translations: the caller reads the rows, says what each entry
 * is called and hands them over. Birthdays and wedding days are yearly events, so a phone's
 * calendar app shows them beside everything else.
 *
 * Only dates with a full day are meant to reach this file: a birthday known to the month would
 * otherwise be pinned to a day nobody recorded.
 */

/** One yearly event of the feed. */
export type CalendarEntry = {
    /** The same on every build, so a subscribed calendar updates an event instead of duplicating it. */
    uid: string;
    /** The first occurrence, as a plain date: 'YYYY-MM-DD'. */
    date: string;
    /** The title, already translated. */
    summary: string;
};

/** The text before the line break in iCalendar; longer lines are folded. */
const FOLD_AT = 75;

/** Escapes a TEXT value: a backslash, a semicolon, a comma and a line break carry meaning. */
function escapeText(value: string): string {
    return value
        .replaceAll("\\", "\\\\")
        .replaceAll(";", "\\;")
        .replaceAll(",", "\\,")
        .replaceAll(/\r?\n/g, "\\n");
}

/** 'YYYY-MM-DD' as the DATE value 'YYYYMMDD'. */
function icsDate(date: string): string {
    return date.replaceAll("-", "");
}

/** A moment as the UTC stamp of iCalendar: 'YYYYMMDDTHHMMSSZ'. */
function icsStamp(moment: Date): string {
    return `${moment.toISOString().replaceAll(/[-:]/g, "").split(".")[0]}Z`;
}

/** iCalendar folds a line over 75 octets; the continuation starts with a space. */
function fold(line: string): string[] {
    const encoder = new TextEncoder();
    const parts: string[] = [];
    let current = "";
    let width = 0;

    for (const character of line) {
        const size = encoder.encode(character).length;
        if (width + size > FOLD_AT) {
            parts.push(current);
            current = " ";
            width = 1;
        }
        current += character;
        width += size;
    }

    parts.push(current);
    return parts;
}

/**
 * The whole feed: a name for the calendar and one yearly event per entry.
 * The caller passes the stamp, so a test can pin it.
 */
export function buildCalendarFeed(options: {
    title: string;
    entries: CalendarEntry[];
    stamp: Date;
}): string {
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Familee//Family calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${escapeText(options.title)}`,
    ];

    const stamp = icsStamp(options.stamp);
    for (const entry of options.entries) {
        lines.push(
            "BEGIN:VEVENT",
            `UID:${entry.uid}`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${icsDate(entry.date)}`,
            "RRULE:FREQ=YEARLY",
            `SUMMARY:${escapeText(entry.summary)}`,
            // A birthday does not make its owner busy for the whole day.
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        );
    }

    lines.push("END:VCALENDAR");

    // iCalendar wants CRLF, and a trailing break after the last line.
    return `${lines.flatMap(fold).join("\r\n")}\r\n`;
}
