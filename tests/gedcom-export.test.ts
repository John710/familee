/**
 * Familee - writing a GEDCOM 7.0 file, and reading it back
 *
 * The file a tree is exported to must open in other programs and come back through our own import
 * without losing anybody: a union with only children, two partners of one sex, a suffix, every
 * marriage, and a value with a line break must all survive.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { DateWords } from "@/lib/fuzzy-date";
import {
    type ExportPerson,
    type ExportUnion,
    type GedDate,
    partnerTags,
    writeGedcom7,
} from "@/lib/gedcom-export";
import { type PlanContext, planImport } from "@/lib/gedcom-plan";

const WORDS: DateWords = {
    between: ["between"],
    and: ["and"],
    from: ["from"],
    to: ["to"],
    before: ["before"],
    after: ["after"],
    estimated: ["estimated"],
    calculated: ["calculated"],
    about: ["about"],
    yearSuffixes: ["year"],
};

const CONTEXT: PlanContext = { words: WORDS, t: (key) => key };

function person(xref: string, overrides: Partial<ExportPerson> = {}): ExportPerson {
    return {
        xref,
        surname: "Ivanov",
        given: "Petr",
        patronymic: "",
        suffix: "",
        sex: "male",
        birth: null,
        death: null,
        notes: "",
        events: [],
        ...overrides,
    };
}

function year(value: number): GedDate {
    return { qualifier: "exact", precision: "year", start: `${value}-01-01`, end: null };
}

function write(persons: ExportPerson[], unions: ExportUnion[]) {
    return writeGedcom7({ persons, unions, sourceName: "Familee", sourceVersion: "9.9.9" });
}

test("gives HUSB and WIFE once each, whatever the sexes", () => {
    assert.deepEqual(partnerTags(["male", "female"]), ["HUSB", "WIFE"]);
    assert.deepEqual(partnerTags(["female", "male"]), ["WIFE", "HUSB"]);
    assert.deepEqual(partnerTags(["male", "male"]), ["HUSB", "WIFE"]);
    assert.deepEqual(partnerTags(["female", "female"]), ["HUSB", "WIFE"]);
    assert.deepEqual(partnerTags(["unknown", "female"]), ["HUSB", "WIFE"]);
    assert.deepEqual(partnerTags(["female", "unknown"]), ["WIFE", "HUSB"]);
    assert.deepEqual(partnerTags(["female"]), ["WIFE"]);
    assert.deepEqual(partnerTags(["unknown"]), ["HUSB"]);
});

test("writes the app version, a suffix, line breaks and every marriage", () => {
    const text = write(
        [
            person("@I1@", {
                suffix: "Jr.",
                events: [
                    {
                        tag: "OCCU",
                        typeCode: "occupation",
                        value: "teacher\nheadmaster",
                        description: "",
                        date: null,
                    },
                ],
            }),
            person("@I2@", { given: "Anna", surname: "Ivanova", sex: "female" }),
        ],
        [
            {
                xref: "@F1@",
                partners: [
                    { xref: "@I1@", sex: "male" },
                    { xref: "@I2@", sex: "female" },
                ],
                children: [],
                marriages: [
                    { date: year(1920), description: "" },
                    { date: year(1945), description: "in church" },
                    { date: null, description: "" },
                ],
            },
        ],
    );

    assert.match(text, /^1 SOUR Familee\n2 VERS 9\.9\.9$/m);
    assert.match(text, /^1 NAME Petr \/Ivanov\/ Jr\.\n2 GIVN Petr\n2 SURN Ivanov\n2 NSFX Jr\.$/m);
    assert.match(text, /^1 OCCU teacher\n2 CONT headmaster$/m);
    assert.match(text, /^1 MARR\n2 DATE 1920\n1 MARR\n2 DATE 1945\n2 NOTE in church\n1 MARR Y$/m);
});

test("a union of children only and a union of two men both come back through the import", () => {
    const text = write(
        [
            person("@I1@"),
            person("@I2@", { given: "Pavel" }),
            person("@I3@", { given: "Olga", sex: "female" }),
            person("@I4@", { given: "Oleg" }),
        ],
        [
            {
                xref: "@F1@",
                partners: [
                    { xref: "@I1@", sex: "male" },
                    { xref: "@I2@", sex: "male" },
                ],
                children: [],
                marriages: [],
            },
            { xref: "@F2@", partners: [], children: ["@I3@", "@I4@"], marriages: [] },
        ],
    );

    const plan = planImport(text, CONTEXT);
    assert.deepEqual(plan.refusals, []);
    assert.deepEqual(
        plan.unions.map((union) => [union.xref, union.partners, union.children]),
        [
            ["@F1@", ["@I1@", "@I2@"], []],
            ["@F2@", [], ["@I3@", "@I4@"]],
        ],
    );
    const suffixedText = write([person("@I1@", { suffix: "III", patronymic: "Sergeevich" })], []);
    const suffixed = planImport(suffixedText, CONTEXT);
    const [only] = suffixed.persons;
    assert.deepEqual([only?.given, only?.patronymic, only?.suffix], ["Petr", "Sergeevich", "III"]);
});
