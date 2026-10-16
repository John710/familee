/**
 * Familee - reading a date as a person wrote it
 *
 * A date in the archive is often not a day: it is a year, a month, "about 1901", a range, or the
 * words a GEDCOM file uses ("BEF 1900"). Every case is turned into the first and the last day the
 * record can mean, plus the qualifier the database stores, and the text the reader typed is kept
 * beside it. Nothing here touches the database or the translations: the words are handed in.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { type DateWords, parseFuzzyDate } from "@/lib/fuzzy-date";

/** The English words, as messages/en.json lists them. */
const WORDS: DateWords = {
    between: ["between", "bet"],
    and: ["and"],
    from: ["from"],
    to: ["to"],
    before: ["before", "bef"],
    after: ["after", "aft"],
    estimated: ["estimated", "est"],
    calculated: ["calculated", "calc", "cal"],
    about: ["about", "abt", "circa", "c"],
    yearSuffixes: ["year", "years"],
};

function parse(text: string) {
    const result = parseFuzzyDate(text, WORDS);
    assert.equal(result.ok, true, `expected "${text}" to be read, got an error`);
    return result.ok ? result.value : null;
}

test("an empty date is no date, and not an error", () => {
    assert.equal(parse(""), null);
    assert.equal(parse("   "), null);
});

test("reads a whole day, whichever way it is written", () => {
    const day = parse("12.04.1921");
    assert.equal(day?.qualifier, "exact");
    assert.equal(day?.precision, "day");
    assert.equal(day?.dateStart, "1921-04-12");
    assert.equal(day?.dateEnd, null);

    const iso = parse("1921-04-12");
    assert.equal(iso?.dateStart, "1921-04-12");
});

test("a month and a year cover the whole period they name", () => {
    const month = parse("04.1921");
    assert.equal(month?.precision, "month");
    assert.equal(month?.dateStart, "1921-04-01");
    assert.equal(month?.dateEnd, "1921-04-30");

    const year = parse("1921");
    assert.equal(year?.precision, "year");
    assert.equal(year?.dateStart, "1921-01-01");
    assert.equal(year?.dateEnd, "1921-12-31");
});

test("knows the leap year when it comes to February", () => {
    assert.equal(parse("29.02.1920")?.dateStart, "1920-02-29");
    assert.equal(parse("02.1900")?.dateEnd, "1900-02-28");
    assert.equal(parseFuzzyDate("29.02.1900", WORDS).ok, false);
});

test("carries the qualifier the file or the reader wrote", () => {
    assert.equal(parse("about 1901")?.qualifier, "about");
    assert.equal(parse("c. 1901")?.qualifier, "about");
    assert.equal(parse("abt 1901")?.qualifier, "about");
    assert.equal(parse("estimated 1901")?.qualifier, "estimated");
    assert.equal(parse("calculated 1901")?.qualifier, "calculated");
    assert.equal(parse("bef 1900")?.qualifier, "before");
    assert.equal(parse("aft 1900")?.qualifier, "after");
});

test("a before and an after name no end: the question stays open", () => {
    assert.equal(parse("before 1900")?.dateEnd, null);
    assert.equal(parse("after 1900")?.dateEnd, null);
    assert.equal(parse("about 1900")?.dateEnd, "1900-12-31");
});

test("reads a range, and the dash counts only with spaces around it", () => {
    const words = parse("between 1915 and 1918");
    assert.equal(words?.qualifier, "between");
    assert.equal(words?.precision, "year");
    assert.equal(words?.dateStart, "1915-01-01");
    assert.equal(words?.dateEnd, "1918-12-31");

    const fromTo = parse("from 12.04.1915 to 1916");
    assert.equal(fromTo?.qualifier, "from_to");
    // The coarser precision describes the whole period.
    assert.equal(fromTo?.precision, "year");
    assert.equal(fromTo?.dateEnd, "1916-12-31");

    const dash = parse("1915 – 1918");
    assert.equal(dash?.qualifier, "between");

    // The dashes inside an ISO date are not a range.
    assert.equal(parse("1915-04-12")?.qualifier, "exact");
});

test("refuses a range that runs backwards, and a day no calendar has", () => {
    assert.equal(parseFuzzyDate("between 1918 and 1915", WORDS).ok, false);
    assert.equal(parseFuzzyDate("31.04.1921", WORDS).ok, false);
    assert.equal(parseFuzzyDate("13.1921", WORDS).ok, false);
    assert.equal(parseFuzzyDate("not a date", WORDS).ok, false);
});

test("keeps the text as it was written, spaces collapsed", () => {
    assert.equal(parse("  about   1901 ")?.original, "about 1901");
});

test("lets a language put a word after the year", () => {
    // "1901 years" is how one language writes a year; the suffix is handed in with the words.
    assert.equal(parse("1901 years")?.dateStart, "1901-01-01");
});
