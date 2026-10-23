/**
 * Familee - a calendar day, and whether a text is one
 *
 * The archive stores days as plain dates, and the browser sends what the date input produced - or,
 * when the action is called directly, anything at all. The database would answer "2007-02-31" with
 * an error of its own; the check belongs before the write, where a sentence can be shown instead.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { formatDay, isDay, yearOfDay } from "@/lib/day";

test("a real day of the calendar is accepted", () => {
    for (const value of ["2007-04-21", "1900-01-01", "2024-02-29", "2000-02-29", "1999-12-31"]) {
        assert.equal(isDay(value), true, value);
    }
});

test("a day that the calendar does not have is refused", () => {
    for (const value of [
        "2007-02-31",
        "2007-02-30",
        "1900-02-29",
        "2023-02-29",
        "2007-13-01",
        "2007-00-10",
        "2007-04-00",
        "2007-04-32",
        "0000-01-01",
    ]) {
        assert.equal(isDay(value), false, value);
    }
});

test("anything that is not a four-two-two date is refused", () => {
    for (const value of [
        "",
        "2007-4-21",
        "21.04.2007",
        "2007-04",
        "2007-04-21T00:00",
        " 2007-04-21",
    ]) {
        assert.equal(isDay(value), false, JSON.stringify(value));
    }
});

test("a day is shown in the reader's language, and an unknown text is handed back", () => {
    assert.equal(formatDay("2007-04-21", "en"), "April 21, 2007");
    assert.equal(formatDay("2007-04-21", "ru"), "21 апреля 2007 г.");
    assert.equal(formatDay("not a day", "en"), "not a day");
});

test("the year is the first four characters", () => {
    assert.equal(yearOfDay("2007-04-21"), "2007");
});
