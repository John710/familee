/**
 * Familee - ages and birthdays
 *
 * The archive keeps one time zone for "today" (the server's own), so that a birthday turns on the
 * day it should wherever the clock sits. A date known only to the year gives an approximate age and
 * no birthday at all. These tests pin the counting: whole years that do not count a birthday not
 * yet come, days across a month, and the 29th of February that falls on the 28th in other years.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    ageOf,
    daysBetween,
    nextBirthday,
    todayIn,
    upcomingBirthdays,
    wholeYears,
} from "@/lib/age";

test("today is read in the time zone the archive chose", () => {
    // 20:00 UTC is already the next day in Vladivostok (UTC+10) and still the same day in UTC.
    const moment = new Date("2026-10-15T20:00:00Z");
    assert.equal(todayIn(moment, "UTC"), "2026-10-15");
    assert.equal(todayIn(moment, "Asia/Vladivostok"), "2026-10-16");
});

test("a birthday not yet come is not counted", () => {
    assert.equal(wholeYears("1990-06-15", "2026-06-14"), 35);
    assert.equal(wholeYears("1990-06-15", "2026-06-15"), 36);
    assert.equal(wholeYears("1990-06-15", "2026-06-16"), 36);
});

test("counts days across a month and a year", () => {
    assert.equal(daysBetween("2026-10-16", "2026-10-20"), 4);
    assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
    assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
    assert.equal(daysBetween("2027-01-01", "2026-12-31"), -1);
});

test("shows today's age for the living and the reached age for the dead", () => {
    const living = ageOf({ date: "1990-06-15", precision: "day", year: 1990 }, null, "2026-06-14");
    assert.deepEqual(living, { living: true, years: 35, approximate: false });

    const dead = ageOf(
        { date: "1900-01-01", precision: "day", year: 1900 },
        { date: "1975-01-01", precision: "day", year: 1975 },
        "2026-06-14",
    );
    assert.deepEqual(dead, { living: false, years: 75, approximate: false });
});

test("a year alone makes the age approximate, and nothing makes no age", () => {
    const approximate = ageOf(
        { date: "1900-01-01", precision: "year", year: 1900 },
        null,
        "2026-06-14",
    );
    assert.equal(approximate?.years, 126);
    assert.equal(approximate?.approximate, true);

    assert.equal(ageOf({ date: null, precision: null, year: null }, null, "2026-06-14"), null);
});

test("announces the birthdays in reach, nearest first", () => {
    const entries = upcomingBirthdays(
        [
            {
                personId: "far",
                name: "Far",
                birthDate: "1980-10-21",
                birthPrecision: "day",
                isLiving: true,
            },
            {
                personId: "today",
                name: "Today",
                birthDate: "1980-10-16",
                birthPrecision: "day",
                isLiving: true,
            },
        ],
        "2026-10-16",
        10,
    );

    assert.deepEqual(
        entries.map((entry) => [entry.personId, entry.inDays, entry.turns]),
        [
            ["today", 0, 46],
            ["far", 5, 46],
        ],
    );
});

test("leaves out the dead, the approximate and the ones out of reach", () => {
    const people: Parameters<typeof upcomingBirthdays>[0] = [
        {
            personId: "dead",
            name: "Dead",
            birthDate: "1900-10-16",
            birthPrecision: "day",
            isLiving: false,
        },
        {
            personId: "vague",
            name: "Vague",
            birthDate: "1900-01-01",
            birthPrecision: "year",
            isLiving: true,
        },
        {
            personId: "unknown",
            name: "Unknown",
            birthDate: null,
            birthPrecision: null,
            isLiving: true,
        },
        {
            personId: "winter",
            name: "Winter",
            birthDate: "1980-12-25",
            birthPrecision: "day",
            isLiving: true,
        },
    ];

    const soon = upcomingBirthdays(people, "2026-10-16", 10);
    assert.deepEqual(soon, []);

    const later = upcomingBirthdays(people, "2026-10-16", 90);
    assert.deepEqual(
        later.map((entry) => entry.personId),
        ["winter"],
    );
});

test("a birthday that has passed waits for next year", () => {
    const [entry] = upcomingBirthdays(
        [
            {
                personId: "spring",
                name: "Spring",
                birthDate: "1990-03-05",
                birthPrecision: "day",
                isLiving: true,
            },
        ],
        "2026-10-16",
        400,
    );

    assert.equal(entry?.date, "2027-03-05");
    assert.equal(entry?.turns, 37);
    assert.equal(entry?.inDays, 140);
});

test("announces nobody who would be older than 110", () => {
    const person = (personId: string, birthDate: string) => ({
        personId,
        name: personId,
        birthDate,
        birthPrecision: "day" as const,
        isLiving: true,
    });

    // With no death date a person is living by the archive's rule; an old tree must not "turn 176".
    const entries = upcomingBirthdays(
        [
            person("long-dead", "1850-10-20"),
            person("of-110", "1916-10-20"),
            person("of-111", "1915-10-20"),
        ],
        "2026-10-16",
        10,
    );

    assert.deepEqual(
        entries.map((entry) => [entry.personId, entry.turns]),
        [["of-110", 110]],
    );
    // The feed asks the same question for one person.
    assert.equal(nextBirthday(person("long-dead", "1850-10-20"), "2026-10-16"), null);
    assert.deepEqual(nextBirthday(person("of-110", "1916-10-20"), "2026-10-16"), {
        date: "2026-10-20",
        turns: 110,
    });
});

test("announces a birthday only for an exact date", () => {
    const person = (personId: string, birthQualifier: string | null | undefined) => ({
        personId,
        name: personId,
        birthDate: "1980-10-20",
        birthPrecision: "day" as const,
        birthQualifier,
        isLiving: true,
    });

    const entries = upcomingBirthdays(
        [
            person("exact", "exact"),
            person("plain", null),
            person("before", "before"),
            person("about", "about"),
            person("between", "between"),
            person("estimated", "estimated"),
        ],
        "2026-10-16",
        10,
    );

    assert.deepEqual(entries.map((entry) => entry.personId).sort(), ["exact", "plain"]);
});

test("shows the age of a qualified date as approximate", () => {
    const born = (qualifier: string | null) => ({
        date: "1990-06-15",
        precision: "day" as const,
        year: 1990,
        qualifier,
    });

    assert.equal(ageOf(born("exact"), null, "2026-06-14")?.approximate, false);
    assert.equal(ageOf(born(null), null, "2026-06-14")?.approximate, false);
    assert.equal(ageOf(born("before"), null, "2026-06-14")?.approximate, true);
    assert.equal(ageOf(born("about"), null, "2026-06-14")?.approximate, true);

    // The same for the death of somebody who is gone.
    const dead = ageOf(
        born("exact"),
        { date: "2000-01-01", precision: "day", year: 2000, qualifier: "after" },
        "2026-06-14",
    );
    assert.equal(dead?.approximate, true);
});

test("a 29 February birthday turns a year older on the 28th of an ordinary year", () => {
    // The lists announce it on the 28th, so the age shown that day agrees with them.
    assert.equal(wholeYears("1992-02-29", "2026-02-27"), 33);
    assert.equal(wholeYears("1992-02-29", "2026-02-28"), 34);
    assert.equal(wholeYears("1992-02-29", "2026-03-01"), 34);
    // In a leap year the day is the 29th itself.
    assert.equal(wholeYears("1992-02-29", "2024-02-28"), 31);
    assert.equal(wholeYears("1992-02-29", "2024-02-29"), 32);

    const [entry] = upcomingBirthdays(
        [
            {
                personId: "leap",
                name: "Leap",
                birthDate: "1992-02-29",
                birthPrecision: "day",
                isLiving: true,
            },
        ],
        "2026-02-28",
        10,
    );
    const age = ageOf({ date: "1992-02-29", precision: "day", year: 1992 }, null, "2026-02-28");
    assert.equal(age?.years, entry?.turns);
});

test("the 29th of February falls on the 28th in other years", () => {
    const [entry] = upcomingBirthdays(
        [
            {
                personId: "leap",
                name: "Leap",
                birthDate: "1992-02-29",
                birthPrecision: "day",
                isLiving: true,
            },
        ],
        "2026-02-27",
        10,
    );

    assert.equal(entry?.date, "2026-02-28");
    assert.equal(entry?.inDays, 1);
    assert.equal(entry?.turns, 34);
});
