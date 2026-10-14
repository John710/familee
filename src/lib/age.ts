/**
 * Familee - ages and birthdays
 *
 * Pure functions on the dates as the database keeps them ("YYYY-MM-DD" strings). The archive
 * keeps one time zone for "today" (the server's home zone), so that a birthday turns on the day it
 * should, wherever the server clock is. A date known only to the year gives an approximate age;
 * the birthday of such a person is not known, so it is not announced.
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

/** The whole years from one date to another ("YYYY-MM-DD" both): a birthday not yet come is not counted. */
export function wholeYears(from: string, to: string): number {
    const [fy = 0, fm = 0, fd = 0] = from.split("-").map(Number);
    const [ty = 0, tm = 0, td = 0] = to.split("-").map(Number);
    let years = ty - fy;
    if (tm < fm || (tm === fm && td < fd)) years -= 1;
    return years;
}

function isLeap(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
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
    birth: { date: string | null; precision: DatePrecision; year: number | null },
    death: { date: string | null; precision: DatePrecision; year: number | null } | null,
    today: string,
): AgeInfo | null {
    if (!birth.date || !birth.precision) return null;
    const birthApprox = birth.precision !== "day";
    if (death?.date && death.precision) {
        const deathApprox = death.precision !== "day";
        return {
            living: false,
            years: wholeYears(birth.date, death.date),
            approximate: birthApprox || deathApprox,
        };
    }
    return { living: true, years: wholeYears(birth.date, today), approximate: birthApprox };
}

/**
 * The living people whose birthday falls within the given number of days, nearest first. Only
 * people with a birthday known to the day take part.
 */
export function upcomingBirthdays(
    people: {
        personId: string;
        name: string;
        birthDate: string | null;
        birthPrecision: DatePrecision;
        isLiving: boolean | null;
        photoUrl?: string | null;
    }[],
    today: string,
    withinDays: number,
): BirthdayEntry[] {
    const todayYear = Number(today.slice(0, 4));
    const entries: BirthdayEntry[] = [];
    for (const person of people) {
        if (person.isLiving === false || !person.birthDate || person.birthPrecision !== "day") {
            continue;
        }
        const birthYear = Number(person.birthDate.slice(0, 4));
        let year = todayYear;
        let date = birthdayIn(year, person.birthDate);
        if (date < today) {
            year += 1;
            date = birthdayIn(year, person.birthDate);
        }
        const inDays = daysBetween(today, date);
        if (inDays > withinDays) continue;
        entries.push({
            personId: person.personId,
            name: person.name,
            date,
            turns: year - birthYear,
            inDays,
            photoUrl: person.photoUrl ?? null,
        });
    }
    return entries.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}
