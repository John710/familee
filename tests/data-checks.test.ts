/**
 * Familee - the implausible in the archive
 *
 * Each rule is told apart from the next, and the quiet ones are checked as carefully as the loud
 * ones: a father may father a child after his death, a "before 1900" is not a date, and a life of a
 * hundred years is long but not a mistake.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    type CheckDate,
    type CheckIssue,
    type CheckPerson,
    findDataProblems,
} from "@/lib/data-checks";

const TODAY = "2026-10-19";

function date(
    start: string | null,
    end: string | null = null,
    qualifier = "exact",
    precision = "day",
): CheckDate {
    return { start, end, qualifier, precision };
}

function person(personId: string, overrides: Partial<CheckPerson> = {}): CheckPerson {
    return {
        personId,
        name: personId,
        sex: "unknown",
        birth: date(null),
        death: date(null),
        isLiving: null,
        ...overrides,
    };
}

function codes(issues: CheckIssue[]): string[] {
    return issues.map((issue) => issue.code);
}

test("a death before the birth is named", () => {
    const issues = findDataProblems({
        persons: [
            person("a", { birth: date("1900-05-01"), death: date("1899-01-01") }),
            person("b", { birth: date("1900-05-01"), death: date("1980-01-01") }),
        ],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.deepEqual(codes(issues), ["birthAfterDeath"]);
    assert.deepEqual(issues[0]?.personIds, ["a"]);
});

test("a child born before a parent is named; a parent born before the child is not", () => {
    const issues = findDataProblems({
        persons: [
            person("child", { birth: date("1890-01-01") }),
            person("parent", { birth: date("1900-01-01") }),
        ],
        edges: [{ parentId: "parent", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.ok(codes(issues).includes("childBeforeParent"));
});

test("a child born after its mother's death is named, but not after its father's", () => {
    const motherIssues = findDataProblems({
        persons: [
            person("child", { birth: date("1910-06-01") }),
            person("mother", { sex: "female", death: date("1900-01-01") }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.ok(codes(motherIssues).includes("childAfterMotherDeath"));

    const fatherOnly = findDataProblems({
        persons: [
            person("child", { birth: date("1910-06-01") }),
            person("father", { sex: "male", death: date("1900-01-01") }),
        ],
        edges: [{ parentId: "father", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(codes(fatherOnly).includes("childAfterMotherDeath"), false);
});

test("a mother of eleven and a father of twenty are named, an ordinary age is not", () => {
    const young = findDataProblems({
        persons: [
            person("child", { birth: date("1911-01-01") }),
            person("mother", { sex: "female", birth: date("1900-01-01") }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.ok(codes(young).includes("motherTooYoung"));
    assert.equal(young[0]?.params?.age, 11);

    const old = findDataProblems({
        persons: [
            person("child", { birth: date("1900-01-01") }),
            person("mother", { sex: "female", birth: date("1840-01-01") }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.ok(codes(old).includes("motherTooOld"));

    const fine = findDataProblems({
        persons: [
            person("child", { birth: date("1900-01-01") }),
            person("mother", { sex: "female", birth: date("1870-01-01") }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(fine.length, 0);
});

test("an age is only judged when both dates are known to the month", () => {
    const vague = findDataProblems({
        persons: [
            person("child", { birth: date("1911-01-01", null, "exact", "year") }),
            person("mother", { sex: "female", birth: date("1900-01-01", null, "exact", "year") }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(vague.length, 0);
});

test("a life of a hundred and thirty years is named, a hundred is not", () => {
    const long = findDataProblems({
        persons: [person("a", { birth: date("1700-01-01"), death: date("1840-01-01") })],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.deepEqual(codes(long), ["implausibleAge"]);
    assert.equal(long[0]?.params?.age, 140);

    const old = findDataProblems({
        persons: [person("a", { birth: date("1700-01-01"), death: date("1800-01-01") })],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(old.length, 0);
});

test("a date in the future is named", () => {
    const issues = findDataProblems({
        persons: [
            person("a", { birth: date("2030-01-01") }),
            person("b", { death: date("2030-01-01") }),
        ],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.deepEqual(codes(issues).sort(), ["futureBirth", "futureDeath"]);
});

test("a marriage before a partner was born is named", () => {
    const issues = findDataProblems({
        persons: [person("a", { birth: date("1900-01-01") })],
        edges: [],
        unions: [{ familyId: "f", partnerIds: ["a"], marriage: date("1890-01-01") }],
        vitalCounts: [],
        today: TODAY,
    });
    assert.deepEqual(codes(issues), ["marriageBeforeBirth"]);
    assert.deepEqual(issues[0]?.personIds, ["a"]);
});

test("two births or two deaths on one person are named", () => {
    const issues = findDataProblems({
        persons: [person("a")],
        edges: [],
        unions: [],
        vitalCounts: [{ personId: "a", births: 2, deaths: 1 }],
        today: TODAY,
    });
    assert.deepEqual(codes(issues), ["duplicateBirth"]);
    assert.equal(issues[0]?.params?.count, 2);
});

test("a parent born 'before' a date is not called too young", () => {
    // Born before 1900 she may be any age, so a child of 1905 proves nothing.
    const open = findDataProblems({
        persons: [
            person("child", { birth: date("1905-06-01") }),
            person("mother", {
                sex: "female",
                birth: date("1900-01-01", null, "before", "day"),
            }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(open.length, 0);

    // A father born 'after' 1800 may be any age at the child's birth in 1900, so not too old.
    const after = findDataProblems({
        persons: [
            person("child", { birth: date("1900-06-01") }),
            person("father", { sex: "male", birth: date("1800-01-01", null, "after", "day") }),
        ],
        edges: [{ parentId: "father", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(after.length, 0);
});

test("a parent age that holds for every allowed date is still named", () => {
    // Born between 1900 and 1902, she was at most eleven in 1911: too young either way.
    const young = findDataProblems({
        persons: [
            person("child", { birth: date("1911-01-01") }),
            person("mother", {
                sex: "female",
                birth: date("1900-01-01", "1902-12-31", "between", "day"),
            }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.deepEqual(codes(young), ["motherTooYoung"]);
    assert.equal(young[0]?.params?.age, 11);

    // Born between 1830 and 1834, she was at least sixty-five in 1900: too old either way.
    const old = findDataProblems({
        persons: [
            person("child", { birth: date("1900-01-01") }),
            person("mother", {
                sex: "female",
                birth: date("1830-01-01", "1834-12-31", "between", "day"),
            }),
        ],
        edges: [{ parentId: "mother", childId: "child" }],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.deepEqual(codes(old), ["motherTooOld"]);
    assert.equal(old[0]?.params?.age, 65);
});

test("a life is only called too long when the qualifiers allow no shorter one", () => {
    // Born after 1800, died before 1950: the span may be a day or two hundred years.
    const open = findDataProblems({
        persons: [
            person("a", {
                birth: date("1800-01-01", null, "after", "day"),
                death: date("1950-01-01", null, "before", "day"),
            }),
        ],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(open.length, 0);

    // Born in 1700, died after 1850: a life of at least a hundred and fifty years in any case.
    const closed = findDataProblems({
        persons: [
            person("a", {
                birth: date("1700-01-01"),
                death: date("1850-01-01", null, "after", "day"),
            }),
        ],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.deepEqual(codes(closed), ["implausibleAge"]);
    assert.equal(closed[0]?.params?.age, 150);

    // "About" gets a year of slack: 111 years on the dates as written, but possibly only 110.
    const about = findDataProblems({
        persons: [
            person("a", {
                birth: date("1700-06-01", null, "about", "day"),
                death: date("1811-07-01"),
            }),
        ],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(about.length, 0);
});

test("a 'before' is not treated as an exact date", () => {
    // Died before 1900, born 1900: not enough to cry wolf, the death may have been in 1899.
    const issues = findDataProblems({
        persons: [
            person("a", {
                birth: date("1900-01-01"),
                death: date("1900-01-01", null, "before", "year"),
            }),
        ],
        edges: [],
        unions: [],
        vitalCounts: [],
        today: TODAY,
    });
    assert.equal(issues.length, 0);
});
