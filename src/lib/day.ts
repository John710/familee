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
