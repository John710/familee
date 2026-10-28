/**
 * Familee - the month grid of a tree's calendar
 *
 * These tests pin the rules the page leans on: the number of days in a month, the blanks that put
 * the first day under its weekday with Monday in the first column, an anniversary of a leap day in
 * a year that has no 29th of February, and the order the entries of one day are shown in.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { type Anniversary, buildMonth, daysInMonth, yearsSince } from "@/lib/tree-calendar";

/** An anniversary with the fields a test does not care about filled in. */
function entry(over: Partial<Anniversary> & { monthDay: string }): Anniversary {
    return {
        key: over.key ?? `key-${over.monthDay}-${over.year ?? "none"}`,
        kind: "event",
        typeCode: "fact",
        title: "Person",
        href: null,
        living: null,
        year: null,
        ...over,
    };
}

test("counts the days of a month, February in a leap year included", () => {
    assert.equal(daysInMonth(2024, 1), 29);
    assert.equal(daysInMonth(2025, 1), 28);
    assert.equal(daysInMonth(2026, 1), 28);
    assert.equal(daysInMonth(2026, 3), 30);
    assert.equal(daysInMonth(2026, 11), 31);
});

test("puts the first day of the month under its weekday, Monday first", () => {
    // The 1st of March 2026 is a Sunday: six blanks come before it.
    const march = buildMonth([], 2026, 2);
    assert.equal(march.length, 42);
    assert.deepEqual(
        march.slice(0, 6).map((cell) => cell.day),
        [null, null, null, null, null, null],
    );
    assert.equal(march[6]?.day, 1);
    assert.equal(march[6]?.date, "2026-03-01");
    // The last day of the month is there, and the week behind it is filled up with blanks.
    assert.equal(march.find((cell) => cell.day === 31)?.date, "2026-03-31");
    assert.deepEqual(march.at(-1), { date: null, day: null, entries: [] });

    // The 1st of February 2027 is a Monday: no blank at all, and four exact weeks.
    const february = buildMonth([], 2027, 1);
    assert.equal(february.length, 28);
    assert.equal(february[0]?.day, 1);
    assert.equal(february.at(-1)?.day, 28);
});

test("gathers the entries of the month under their day and leaves the others out", () => {
    const cells = buildMonth(
        [
            entry({ monthDay: "03-05", title: "Fifth" }),
            entry({ monthDay: "04-05", title: "Another month" }),
            entry({ monthDay: "03-05", title: "Fifth too" }),
        ],
        2026,
        2,
    );

    const fifth = cells.find((cell) => cell.day === 5);
    assert.deepEqual(
        fifth?.entries.map((item) => item.title),
        ["Fifth", "Fifth too"],
    );
    assert.deepEqual(cells.find((cell) => cell.day === 6)?.entries, []);
    // Nothing of the same day is dropped, and no other month leaks in.
    assert.equal(cells.flatMap((cell) => cell.entries).length, 2);
});

test("holds an entry from the year it happened on, and not before", () => {
    const entries = [
        entry({ monthDay: "07-04", year: 1975, title: "Wedding" }),
        entry({ monthDay: "07-04", kind: "birthday", year: 1980, title: "Anna" }),
        entry({ monthDay: "07-04", year: null, title: "Undated" }),
    ];

    // Today: it happened long ago, and it stands as an anniversary with its year.
    const today = buildMonth(entries, 2026, 6);
    assert.deepEqual(
        today.find((cell) => cell.day === 4)?.entries.map((item) => item.title),
        ["Anna", "Wedding", "Undated"],
    );

    // 1970: the wedding is two years away and Anna is not born, so neither is written.
    const longBefore = buildMonth(entries, 1970, 6);
    assert.deepEqual(
        longBefore.find((cell) => cell.day === 4)?.entries.map((item) => item.title),
        ["Undated"],
    );
});

test("marks a leap-day anniversary on the 28th of February in an ordinary year", () => {
    const leap = buildMonth([entry({ monthDay: "02-29", title: "Leap" })], 2024, 1);
    assert.equal(leap.find((cell) => cell.entries.length > 0)?.day, 29);

    const ordinary = buildMonth([entry({ monthDay: "02-29", title: "Leap" })], 2025, 1);
    const day = ordinary.find((cell) => cell.entries.length > 0)?.day;
    assert.equal(day, 28);
});

test("shows a birthday before an event and the older event first", () => {
    const cells = buildMonth(
        [
            entry({ monthDay: "05-09", kind: "event", year: 1975, title: "Wedding" }),
            entry({ monthDay: "05-09", kind: "birthday", year: 1980, title: "Anna" }),
            entry({ monthDay: "05-09", kind: "event", year: 1910, title: "Old wedding" }),
            entry({ monthDay: "05-09", kind: "event", year: null, title: "Undated" }),
        ],
        2026,
        4,
    );

    assert.deepEqual(
        cells.find((cell) => cell.day === 9)?.entries.map((item) => item.title),
        ["Anna", "Old wedding", "Wedding", "Undated"],
    );
});

test("announces no living birthday of somebody older than 110, but keeps the dead", () => {
    const birthday = (year: number, title: string, living: boolean) =>
        entry({ monthDay: "05-09", kind: "birthday", year, title, living });
    const entries = [
        birthday(1850, "Old living", true),
        birthday(1850, "Old dead", false),
        birthday(1916, "Of 110", true),
        birthday(1915, "Of 111", true),
        entry({ monthDay: "05-09", kind: "event", year: 1850, title: "Wedding" }),
    ];

    const titles = buildMonth(entries, 2026, 4)
        .find((cell) => cell.day === 9)
        ?.entries.map((item) => item.title);

    // The dead keep their day, with no age; the wedding is no birthday; 110 still turns.
    assert.deepEqual(titles, ["Old dead", "Of 110", "Wedding"]);

    // In 1916 the first one was 66, and the page of that year still holds every birthday.
    const back = buildMonth(entries, 1916, 4)
        .find((cell) => cell.day === 9)
        ?.entries.map((item) => item.title);
    assert.deepEqual(back, ["Old dead", "Old living", "Of 111", "Of 110", "Wedding"]);
});

test("counts the years an anniversary reaches, and nothing without a year", () => {
    assert.equal(yearsSince(entry({ monthDay: "05-09", year: 1980 }), 2026), 46);
    assert.equal(yearsSince(entry({ monthDay: "05-09", year: 1890 }), 2026), 136);
    assert.equal(yearsSince(entry({ monthDay: "05-09", year: null }), 2026), null);
});
