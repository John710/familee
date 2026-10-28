/**
 * Familee - ages and birthdays
 *
 * Pure functions on the dates as the database keeps them ("YYYY-MM-DD" strings). The archive
 * keeps one time zone for "today" (the server's home zone), so that a birthday turns on the day it
 * should, wherever the server clock is. A date known only to the year, or qualified ("before",
 * "about"...), gives an approximate age; the birthday of such a person is not known, so it is not
 * announced. Nor is the birthday of somebody who would be older than MAX_BIRTHDAY_AGE.
 */

/**
 * The archive's time zone: APP_TIME_ZONE from the environment, the same value the container
 * takes as TZ (docker-compose.build.yml). Read at each call, so a changed .env applies after a restart.
 */
export function appTimeZone(): string {
    return process.env.APP_TIME_ZONE || process.env.TZ || "UTC";
}

/** The precision the database keeps; anything but the day makes the date approximate here. */
export type DatePrecision = "century" | "decade" | "year" | "month" | "day" | null;

export type AgeInfo = {
    /** True: the person is alive, the age is today's. False: the age the person reached. */
    living: boolean;
    years: number;
    /** The birth or the death is known only to the year (or is about): the age may be a year off. */
    approximate: boolean;
};

export type BirthdayEntry = {
    personId: string;
    name: string;
    /** The next birthday, "YYYY-MM-DD". */
    date: string;
    /** The age the person turns on that day. */
    turns: number;
    /** Days from today; zero is today. */
    inDays: number;
    /** The small picture of the person, or null: the lists then show a placeholder. */
    photoUrl: string | null;
};

/** Today in the archive's time zone, as "YYYY-MM-DD". */
export function todayIn(now: Date = new Date(), timeZone = appTimeZone()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/**
 * The whole years from one date to another ("YYYY-MM-DD" both): a birthday not yet come is not
 * counted. A 29 February birthday comes on 28 February in a year that has no 29th, the same day
 * the birthday lists announce it, so the two always agree.
 */
export function wholeYears(from: string, to: string): number {
    const [fy = 0, fm = 0, fd = 0] = from.split("-").map(Number);
    const [ty = 0, tm = 0, td = 0] = to.split("-").map(Number);
    const birthdayDay = fm === 2 && fd === 29 && !isLeap(ty) ? 28 : fd;
    let years = ty - fy;
    if (tm < fm || (tm === fm && td < birthdayDay)) years -= 1;
    return years;
}

function isLeap(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * No birthday is announced for somebody who would be older than this. By the archive's rule a
 * person without a death date is living, so the long-dead of an old tree would otherwise "turn 176".
 */
export const MAX_BIRTHDAY_AGE = 110;

/** A date written without a qualifier, or as exact: the only kind that has a day to celebrate. */
export function isExactQualifier(qualifier: string | null | undefined): boolean {
    return qualifier === undefined || qualifier === null || qualifier === "exact";
}

/** The day of a birthday in the given year: 29 February falls on 28 February in other years. */
function birthdayIn(year: number, birth: string): string {
    const [, month = "01", day = "01"] = birth.split("-");
    if (month === "02" && day === "29" && !isLeap(year)) return `${year}-02-28`;
    return `${year}-${month}-${day}`;
}

/** The days from one date to another ("YYYY-MM-DD" both), counting calendar days. */
export function daysBetween(from: string, to: string): number {
    const day = (value: string) => {
        const [y = 0, m = 1, d = 1] = value.split("-").map(Number);
        return Date.UTC(y, m - 1, d) / 86_400_000;
    };
    return Math.round(day(to) - day(from));
}

/**
 * The age shown on a card: today's for the living, the reached age for the dead. Nothing is shown
 * when the birth is not known to at least the year.
 */
export function ageOf(
    birth: {
        date: string | null;
        precision: DatePrecision;
        year: number | null;
        /** "before", "about", "between"...: such a date has a day on paper only. */
        qualifier?: string | null;
    },
    death: {
        date: string | null;
        precision: DatePrecision;
        year: number | null;
        qualifier?: string | null;
    } | null,
    today: string,
): AgeInfo | null {
    if (!birth.date || !birth.precision) return null;
    const birthApprox = birth.precision !== "day" || !isExactQualifier(birth.qualifier);
    if (death?.date && death.precision) {
        const deathApprox = death.precision !== "day" || !isExactQualifier(death.qualifier);
        return {
            living: false,
            years: wholeYears(birth.date, death.date),
            approximate: birthApprox || deathApprox,
        };
    }
    return { living: true, years: wholeYears(birth.date, today), approximate: birthApprox };
}

/** The birth of a person as the birthday lists read it. */
export type BirthdayPerson = {
    birthDate: string | null;
    birthPrecision: DatePrecision;
    /** A qualified date ("before", "about"...) has no day to celebrate; missing counts as exact. */
    birthQualifier?: string | null;
    isLiving: boolean | null;
};

/**
 * The next birthday of a person that is worth announcing, or null: the person is not living, the
 * birth is not an exact day, or the person would be older than MAX_BIRTHDAY_AGE. One rule for the
 * bell, the tree cards, the calendar feed and the lists.
 */
export function nextBirthday(
    person: BirthdayPerson,
    today: string,
): { date: string; turns: number } | null {
    if (person.isLiving === false || !person.birthDate || person.birthPrecision !== "day") {
        return null;
    }
    if (!isExactQualifier(person.birthQualifier)) return null;

    const birthYear = Number(person.birthDate.slice(0, 4));
    let year = Number(today.slice(0, 4));
    let date = birthdayIn(year, person.birthDate);
    if (date < today) {
        year += 1;
        date = birthdayIn(year, person.birthDate);
    }
    const turns = year - birthYear;
    if (turns > MAX_BIRTHDAY_AGE) return null;
    return { date, turns };
}

/**
 * The living people whose birthday falls within the given number of days, nearest first. Only
 * people with a birthday known to the day take part.
 */
export function upcomingBirthdays(
    people: (BirthdayPerson & {
        personId: string;
        name: string;
        photoUrl?: string | null;
    })[],
    today: string,
    withinDays: number,
): BirthdayEntry[] {
    const entries: BirthdayEntry[] = [];
    for (const person of people) {
        const next = nextBirthday(person, today);
        if (!next) continue;
        const inDays = daysBetween(today, next.date);
        if (inDays > withinDays) continue;
        entries.push({
            personId: person.personId,
            name: person.name,
            date: next.date,
            turns: next.turns,
            inDays,
            photoUrl: person.photoUrl ?? null,
        });
    }
    return entries.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}
