/**
 * Familee - one calendar day as a reader sees it
 *
 * The day of a photograph or a birthday has no clock, so it must not travel through the time zone of
 * whoever reads it: a picture of the 21st stays on the 21st. Anything that is not a day is handed
 * back as it came, so a broken value reaches the page instead of an exception.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { formatDay, yearOfDay } from "@/lib/day";

test("names the day in the language of the reader", () => {
    assert.equal(formatDay("2007-04-21", "en"), "April 21, 2007");
    assert.equal(formatDay("2007-04-21", "ru"), "21 апреля 2007 г.");
});

test("keeps the day of a month boundary", () => {
    // A day read in local time west of UTC would slide to the day before.
    assert.match(formatDay("2000-01-01", "en"), /January 1, 2000/);
    assert.match(formatDay("1999-12-31", "en"), /December 31, 1999/);
});

test("hands back what it does not understand", () => {
    assert.equal(formatDay("about 1900", "en"), "about 1900");
    assert.equal(formatDay("", "en"), "");
});

test("takes the year alone", () => {
    assert.equal(yearOfDay("2007-04-21"), "2007");
});
