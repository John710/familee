/**
 * Familee - the calendar of a tree as a file a phone can subscribe to
 *
 * The feed is plain text with rules that a calendar app enforces: CRLF line breaks, a line folded
 * over 75 octets with a leading space on the continuation, and a backslash before a comma, a
 * semicolon or a backslash. These tests pin those rules, and that every entry becomes one yearly
 * event: a birthday or a wedding day comes round again.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildCalendarFeed } from "@/lib/calendar";

const STAMP = new Date("2026-10-16T07:30:00Z");

/** The feed as the logical lines a calendar app reads, unfolding the continuations. */
function unfold(feed: string): string[] {
    const lines: string[] = [];
    for (const line of feed.split("\r\n")) {
        if (line.startsWith(" ") && lines.length > 0) {
            lines[lines.length - 1] += line.slice(1);
        } else {
            lines.push(line);
        }
    }
    return lines;
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}

test("writes a feed a calendar app accepts", () => {
    const feed = buildCalendarFeed({
        title: "Family",
        entries: [{ uid: "birth-1@familee", date: "1990-04-21", summary: "Petr's birthday" }],
        stamp: STAMP,
    });

    assert.ok(feed.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(feed.endsWith("END:VCALENDAR\r\n"));
    assert.ok(feed.includes("VERSION:2.0\r\n"));
    assert.ok(feed.includes("CALSCALE:GREGORIAN\r\n"));

    // Only CRLF: a bare line feed would make the file invalid.
    assert.equal(feed.replaceAll("\r\n", "").includes("\n"), false);
});

test("makes one yearly event of each entry", () => {
    const feed = buildCalendarFeed({
        title: "Family",
        entries: [
            { uid: "birth-1@familee", date: "1990-04-21", summary: "Petr's birthday" },
            {
                uid: "wedding-2@familee",
                date: "1915-02-03",
                summary: "The wedding of Anna and Ivan",
            },
        ],
        stamp: STAMP,
    });

    const lines = unfold(feed);
    assert.equal(lines.filter((line) => line === "BEGIN:VEVENT").length, 2);
    assert.equal(lines.filter((line) => line === "END:VEVENT").length, 2);
    assert.equal(lines.filter((line) => line === "RRULE:FREQ=YEARLY").length, 2);
    assert.equal(lines.filter((line) => line === "TRANSP:TRANSPARENT").length, 2);

    assert.ok(lines.includes("UID:birth-1@familee"));
    assert.ok(lines.includes("DTSTART;VALUE=DATE:19900421"));
    assert.ok(lines.includes("UID:wedding-2@familee"));
    assert.ok(lines.includes("DTSTART;VALUE=DATE:19150203"));
    // The stamp is the moment the file was built, in UTC, and the same for every event.
    assert.equal(lines.filter((line) => line === "DTSTAMP:20261016T073000Z").length, 2);
});

test("names the calendar with its title", () => {
    const feed = buildCalendarFeed({ title: "Семья Ивановых", entries: [], stamp: STAMP });
    assert.ok(unfold(feed).includes("X-WR-CALNAME:Семья Ивановых"));
});

test("escapes what a value must not carry plain", () => {
    const feed = buildCalendarFeed({
        title: "Family",
        entries: [
            {
                uid: "x@familee",
                date: "1990-04-21",
                summary: "Ivanov, Petr; a note\\line\nand another",
            },
        ],
        stamp: STAMP,
    });

    assert.ok(
        unfold(feed).includes("SUMMARY:Ivanov\\, Petr\\; a note\\\\line\\nand another"),
        "the comma, the semicolon, the backslash and the break stay escaped",
    );
});

test("turns every kind of line break in a value into the escaped one", () => {
    const feed = buildCalendarFeed({
        title: "Family",
        entries: [{ uid: "x@familee", date: "1990-04-21", summary: "one\rtwo\r\nthree\nfour" }],
        stamp: STAMP,
    });

    // A lone carriage return left in the file would end the content line for a reader.
    assert.ok(unfold(feed).includes("SUMMARY:one\\ntwo\\nthree\\nfour"));
    assert.equal(feed.replaceAll("\r\n", "").includes("\r"), false);
});

test("keeps a 29 February event in the years that have no 29th", () => {
    const feed = buildCalendarFeed({
        title: "Family",
        entries: [
            { uid: "leap@familee", date: "1992-02-29", summary: "Leap" },
            { uid: "plain@familee", date: "1992-03-01", summary: "Plain" },
        ],
        stamp: STAMP,
    });

    const lines = unfold(feed);
    // The last day of February: the 28th or the 29th, as the year has it.
    assert.equal(
        lines.filter((line) => line === "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1").length,
        1,
    );
    assert.equal(lines.filter((line) => line === "RRULE:FREQ=YEARLY").length, 1);
});

test("folds a long line at 75 octets and unfolds to the same text", () => {
    // 40 Cyrillic letters are 80 octets, so the line cannot be longer than that.
    const summary = "Иванов Пётр Сергеевич и Иванова Анна Петровна";
    const feed = buildCalendarFeed({
        title: "Family",
        entries: [{ uid: "x@familee", date: "1990-04-21", summary }],
        stamp: STAMP,
    });

    for (const line of feed.split("\r\n")) {
        assert.ok(byteLength(line) <= 75, `a line of ${byteLength(line)} octets is too long`);
    }

    // The continuation is a line of its own, so the summary was folded.
    const physical = feed.split("\r\n");
    assert.ok(
        physical.some((line) => line.startsWith(" ")),
        "the line was not folded",
    );

    assert.ok(unfold(feed).includes(`SUMMARY:${summary}`));
});
