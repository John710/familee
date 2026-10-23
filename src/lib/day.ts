/**
 * Familee - one calendar day as a reader sees it
 *
 * The days of the archive are plain calendar dates ("2007-04-21"): a photograph, a birthday, a wedding
 * has no clock and no place on the globe. Formatting them through the local time zone of the browser
 * would shift a picture of the 21st to the 20th for a reader west of us, so the day is read as UTC.
 *
 * Pure: a date in, a string out, and a value the browser does not recognize is handed back unchanged
 * rather than thrown away.
 */

/** "2007-04-21" as "21 April 2007" in the reader's language. */
export function formatDay(day: string, locale: string): string {
    const at = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(at.getTime())) return day;
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(at);
}

/** Just the year of "2007-04-21", for a caption that has no room for more. */
export function yearOfDay(day: string): string {
    return day.slice(0, 4);
}

/**
 * Whether the text is a real calendar day: "2007-04-21" yes, "2007-02-31" and "2007-13-01" no.
 *
 * The database refuses such a date with an error of its own, which would reach the reader as a
 * failed request instead of a sentence about the date. The check is done here, before the write.
 * The year is counted arithmetically rather than through Date, whose two-digit years are 19xx.
 */
export function isDay(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12) return false;

    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const length = lengths[month - 1];
    return length !== undefined && day >= 1 && day <= length;
}
