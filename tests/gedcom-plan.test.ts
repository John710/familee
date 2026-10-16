/**
 * Familee - the plan of a GEDCOM import
 *
 * The import reads the file and says what it would create before anything is written: the persons
 * with their names and life dates, the unions with their partners and children, and a warning for
 * every line it could not trust. A date that cannot be read must never stop the import later, so
 * it stays in the notes and is warned about here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { DateWords } from "@/lib/fuzzy-date";
import { gedcomDateToInput, type ImportPlan, planImport } from "@/lib/gedcom-plan";

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

/** A translator that keeps the key and its values, so a test can see which message was written. */
const t = (key: string, values?: Record<string, string | number>): string =>
    values
        ? `${key}(${Object.entries(values)
              .map(([name, value]) => `${name}=${value}`)
              .join(",")})`
        : key;

function plan(text: string): ImportPlan {
    return planImport(text, { words: WORDS, t });
}

function personOf(result: ImportPlan, xref: string) {
    return result.persons.find((entry) => entry.xref === xref);
}

const HEADER = "0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n";

test("reads a date in the form the editor takes", () => {
    assert.deepEqual(gedcomDateToInput("27 JAN 1963", WORDS), { ok: true, input: "1963-01-27" });
    assert.deepEqual(gedcomDateToInput("MAY 1963", WORDS), { ok: true, input: "1963-05" });
    assert.deepEqual(gedcomDateToInput("1921", WORDS), { ok: true, input: "1921" });
    // A day written with one digit is padded, and the case of the month does not matter.
    assert.deepEqual(gedcomDateToInput("5 mar 1900", WORDS), { ok: true, input: "1900-03-05" });
});

test("carries the modifiers of the file into the words of the locale", () => {
    assert.deepEqual(gedcomDateToInput("ABT 1901", WORDS), { ok: true, input: "about 1901" });
    assert.deepEqual(gedcomDateToInput("EST 1901", WORDS), { ok: true, input: "estimated 1901" });
    assert.deepEqual(gedcomDateToInput("CAL 1901", WORDS), { ok: true, input: "calculated 1901" });
    assert.deepEqual(gedcomDateToInput("BEF 1900", WORDS), { ok: true, input: "before 1900" });
    assert.deepEqual(gedcomDateToInput("AFT 1900", WORDS), { ok: true, input: "after 1900" });
    assert.deepEqual(gedcomDateToInput("BET 1915 AND 1918", WORDS), {
        ok: true,
        input: "between 1915 and 1918",
    });
    assert.deepEqual(gedcomDateToInput("FROM 1915 TO 1918", WORDS), {
        ok: true,
        input: "from 1915 to 1918",
    });
    assert.deepEqual(gedcomDateToInput("ABT MAY 1963", WORDS), {
        ok: true,
        input: "about 1963-05",
    });
});

test("does not read a date it cannot trust", () => {
    // A calendar other than the Gregorian, half a range, a phrase, a month it does not know.
    assert.equal(gedcomDateToInput("@#DJULIAN@ 12 APR 1900", WORDS).ok, false);
    assert.equal(gedcomDateToInput("FROM 1915", WORDS).ok, false);
    assert.equal(gedcomDateToInput("TO 1918", WORDS).ok, false);
    assert.equal(gedcomDateToInput("(sometime in the spring)", WORDS).ok, false);
    assert.equal(gedcomDateToInput("12 FOO 1900", WORDS).ok, false);
    assert.equal(gedcomDateToInput("", WORDS).ok, false);

    // Days no calendar has are refused here, before they reach the database.
    assert.equal(gedcomDateToInput("32 JAN 1900", WORDS).ok, false);
    assert.equal(gedcomDateToInput("30 FEB 1900", WORDS).ok, false);
});

test("makes a person of every name in the file", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 NAME Ivan /Ivanov/
2 GIVN Ivan
2 SURN Ivanov
1 SEX M
1 BIRT
2 DATE 27 JAN 1900
1 DEAT
2 DATE ABT 1975
0 @I2@ INDI
1 NAME Anna /Ivanova/
1 SEX F
1 BIRT
2 DATE 1901
0 @I3@ INDI
1 NAME Unknown /Person/
1 SEX X
0 TRLR
`);

    assert.equal(result.version, "5.5.1");
    assert.equal(result.persons.length, 3);

    const ivan = personOf(result, "@I1@");
    assert.equal(ivan?.surname, "Ivanov");
    assert.equal(ivan?.given, "Ivan");
    assert.equal(ivan?.sex, "male");
    assert.equal(ivan?.birth, "1900-01-27");
    assert.equal(ivan?.death, "about 1975");

    assert.equal(personOf(result, "@I2@")?.sex, "female");
    assert.equal(personOf(result, "@I2@")?.birth, "1901");
    // A sex the archive does not keep (X, and U) is read as unknown.
    assert.equal(personOf(result, "@I3@")?.sex, "unknown");
    assert.deepEqual(result.warnings, []);
});

test("takes the name apart", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 NAME Petr Sergeevich /Ivanov/
0 @I2@ INDI
1 NAME Anna /Ivanova/
0 @I3@ INDI
1 NAME Ivan /Ivanov/
2 NSFX Jr.
0 TRLR
`);

    // With no GIVN/SURN tags the name is read from the slashes, and the words after the first
    // one are the patronymic (the MyHeritage export writes it that way).
    const petr = personOf(result, "@I1@");
    assert.deepEqual(
        [petr?.given, petr?.patronymic, petr?.surname],
        ["Petr", "Sergeevich", "Ivanov"],
    );

    assert.deepEqual(
        [personOf(result, "@I2@")?.given, personOf(result, "@I2@")?.patronymic],
        ["Anna", ""],
    );
    assert.equal(personOf(result, "@I3@")?.suffix, "Jr.");
});

test("refuses a person the file gives no name", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 SEX M
0 TRLR
`);

    assert.equal(result.persons.length, 0);
    assert.deepEqual(result.warnings, [{ xref: "@I1@", message: "noName" }]);
});

test("keeps a date it cannot read in the notes and warns about it", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 NAME Ok /Person/
1 BIRT
2 DATE 32 JAN 1900
3 PHRASE born in the winter
0 TRLR
`);

    const person = personOf(result, "@I1@");
    assert.equal(person?.birth, "");
    assert.match(person?.notes ?? "", /birthPhrase\(phrase=born in the winter\)/);
    assert.match(person?.notes ?? "", /birthDateInFile\(date=32 JAN 1900\)/);
    assert.deepEqual(result.warnings, [
        { xref: "@I1@", message: "birthDateNotRead(date=32 JAN 1900)" },
    ]);
});

test("a death without a date is a warning of its own", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 NAME Dead /Person/
1 DEAT
0 TRLR
`);

    assert.equal(personOf(result, "@I1@")?.death, "");
    assert.deepEqual(result.warnings, [{ xref: "@I1@", message: "deathWithoutDate" }]);
});

test("cleans the markup out of a description", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 NAME Curly /Person/
1 DSCR <B>curly hair</B> and <I>green</I> eyes
0 TRLR
`);

    assert.equal(personOf(result, "@I1@")?.notes, "curly hair and green eyes");
});

test("reads a union, and leaves out the people who are not in the file", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 NAME Ivan /Ivanov/
0 @I2@ INDI
1 NAME Anna /Ivanova/
0 @I3@ INDI
1 NAME Petr /Ivanov/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I9@
1 MARR
2 DATE BET 1920 AND 1921
0 @F2@ FAM
1 HUSB @I9@
0 TRLR
`);

    assert.equal(result.unions.length, 1);
    const union = result.unions[0];
    assert.deepEqual(union?.partners, ["@I1@", "@I2@"]);
    // The child the file does not describe is left out; the union is still read.
    assert.deepEqual(union?.children, ["@I3@"]);
    assert.equal(union?.marriage, "between 1920 and 1921");

    // A union whose people are all missing is not created, and is warned about.
    assert.deepEqual(result.warnings, [{ xref: "@F2@", message: "unionWithoutPartners" }]);
});

test("warns about a marriage date it cannot read", () => {
    const result = plan(`${HEADER}0 @I1@ INDI
1 NAME Ivan /Ivanov/
0 @F1@ FAM
1 HUSB @I1@
1 MARR
2 DATE (the year they met)
0 TRLR
`);

    assert.equal(result.unions[0]?.marriage, "");
    assert.deepEqual(result.warnings, [
        { xref: "@F1@", message: "marriageDateNotRead(date=(the year they met))" },
    ]);
});

test("counts the lines it could not read", () => {
    const result = plan(`${HEADER}this is not a gedcom line
0 @I1@ INDI
1 NAME Ok /Person/
0 TRLR
`);

    assert.deepEqual(result.warnings, [{ xref: "file", message: "skippedLines(count=1)" }]);
});

test("says the version of the file, and unknown when the header has none", () => {
    assert.equal(plan(`${HEADER}0 TRLR\n`).version, "5.5.1");
    assert.equal(plan("0 @I1@ INDI\n1 NAME Ok /Person/\n").version, "unknown");
});
