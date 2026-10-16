/**
 * Familee - the people (and the records) that look like one entered twice
 *
 * The duplicates page and the bookkeeping of places and sources both read these functions, so the
 * grouping has to be predictable: an equal name whose years contradict each other is not a group, an
 * equal name without years is, and the text of a place or a source is compared the same way a name
 * is. Nothing here touches the database.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    type DuplicatePerson,
    duplicateScore,
    findDuplicates,
    groupByText,
    nameKey,
    yearOf,
} from "@/lib/duplicates";

function person(overrides: Partial<DuplicatePerson>): DuplicatePerson {
    return {
        personId: "p",
        fullName: null,
        surname: null,
        given: null,
        patronymic: null,
        birthYear: null,
        deathYear: null,
        ...overrides,
    };
}

test("compares a name without its case, its accents or its punctuation", () => {
    assert.equal(nameKey(person({ surname: "Иванов", given: "Пётр" })), "иванов петр");
    assert.equal(nameKey(person({ surname: "ivanov", given: "Petr" })), "ivanov petr");
    // The patronymic is left out: one record carries it and the other does not.
    assert.equal(
        nameKey(person({ surname: "Ivanov", given: "Petr", patronymic: "Sergeevich" })),
        "ivanov petr",
    );
});

test("falls back to the full name when there is no surname", () => {
    assert.equal(nameKey(person({ fullName: "Пётр Иванов" })), "петр иванов");
});

test("an equal name with contradicting years is not the same person", () => {
    const a = person({ surname: "Ivanov", given: "Petr", birthYear: 1900 });
    const b = person({ surname: "Ivanov", given: "Petr", birthYear: 1912 });

    assert.equal(duplicateScore(a, b), 0);
});

test("an equal name without years still looks like one person", () => {
    const a = person({ surname: "Ivanov", given: "Petr" });
    const b = person({ surname: "Ivanov", given: "Petr" });

    assert.equal(duplicateScore(a, b), 3);
    assert.equal(findDuplicates([a, b]).length, 1);
});

test("groups only where two look like one, and says why", () => {
    const groups = findDuplicates([
        person({ personId: "a", surname: "Ivanov", given: "Petr", birthYear: 1900 }),
        person({ personId: "b", surname: "Ivanov", given: "Petr", birthYear: 1900 }),
        person({ personId: "c", surname: "Ivanov", given: "Petr", birthYear: 1880 }),
        person({ personId: "d", surname: "Sidorov", given: "Anna" }),
    ]);

    assert.equal(groups.length, 1);
    const [first] = groups;
    // The two born in 1900 look like one; the one born in 1880 is left alone rather than forced in.
    assert.deepEqual(
        first?.persons.map((p) => p.personId),
        ["a", "b"],
    );
    assert.equal(first?.sameBirthYear, true);
    assert.equal(first?.birthYearsUnknown, false);
    // Anna is alone under her name, so she is not a group.
    assert.equal(
        groups.some((group) => group.persons.some((p) => p.personId === "d")),
        false,
    );
});

test("groups records of the same text, the biggest group first", () => {
    const places = [
        { id: "1", name: "Tula" },
        { id: "2", name: "tula, " },
        { id: "3", name: "Tula" },
        { id: "4", name: "Moscow" },
        { id: "5", name: "" },
    ];

    const groups = groupByText(places, (place) => place.name);
    assert.equal(groups.length, 1);
    assert.deepEqual(
        groups[0]?.map((place) => place.id),
        ["1", "2", "3"],
    );
});

test("reads the year out of a date as a file writes it", () => {
    assert.equal(yearOf("12.04.1921"), 1921);
    assert.equal(yearOf("1921"), 1921);
    assert.equal(yearOf("about 1900"), 1900);
    assert.equal(yearOf("unknown"), null);
});
