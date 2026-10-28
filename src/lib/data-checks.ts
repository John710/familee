/**
 * Familee - the implausible in the archive
 *
 * The archive does not stop a person from typing a death before a birth, and it should not: a
 * source may say exactly that, and the reader decides. What it can do is say so, calmly, on a page
 * of its own: a child born before a parent, a mother of nine, a marriage before a birth, a life of
 * a hundred and thirty years, a date in the future, two births on one person.
 *
 * Everything here is pure: it takes the people, the parent edges, the unions and the counts, and
 * returns the issues. Nothing is written, so the page can show the same list to anybody who may see
 * the tree. The dates are the fuzzy ones the archive keeps, with a qualifier; a comparison is only
 * made when it is clearly impossible with the dates as recorded, so a "before 1900" does not turn
 * into a false alarm. See tests/data-checks.test.ts.
 */

export type CheckDate = {
    /** The first day the record allows, "YYYY-MM-DD", or null. */
    start: string | null;
    /** The last day it allows, or null; equals the start for a plain date. */
    end: string | null;
    /** exact · about · before · after · between · from_to … (see familee.date_qualifier). */
    qualifier: string | null;
    /** day · month · year · decade · century. */
    precision: string | null;
};

export type CheckPerson = {
    personId: string;
    name: string | null;
    sex: "male" | "female" | "unknown";
    birth: CheckDate;
    death: CheckDate;
    isLiving: boolean | null;
};

export type CheckEdge = { parentId: string; childId: string };

export type CheckUnion = {
    familyId: string;
    partnerIds: string[];
    /** The day the union was formed, when it carries one. */
    marriage: CheckDate;
};

export type VitalCount = { personId: string; births: number; deaths: number };

export type CheckInput = {
    persons: CheckPerson[];
    edges: CheckEdge[];
    unions: CheckUnion[];
    vitalCounts: VitalCount[];
    /** Today in the archive's time zone, "YYYY-MM-DD". */
    today: string;
};

export type CheckCode =
    | "birthAfterDeath"
    | "childBeforeParent"
    | "childAfterMotherDeath"
    | "motherTooYoung"
    | "motherTooOld"
    | "fatherTooYoung"
    | "fatherTooOld"
    | "implausibleAge"
    | "futureBirth"
    | "futureDeath"
    | "marriageBeforeBirth"
    | "duplicateBirth"
    | "duplicateDeath";

export type CheckIssue = {
    code: CheckCode;
    /** The people the reader should look at; the first one the message is about. */
    personIds: string[];
    /** The numbers a message fills in: an age, a count. */
    params?: Record<string, number>;
};

/** A date as the smallest and the largest moment it could be. A bound that is unknown is null. */
type Interval = { lo: string | null; hi: string | null };

function interval(date: CheckDate): Interval {
    if (!date.start) return { lo: null, hi: null };
    if (date.qualifier === "before") return { lo: null, hi: date.start };
    if (date.qualifier === "after") return { lo: date.start, hi: null };
    return { lo: date.start, hi: date.end ?? date.start };
}

/** The youngest mother, the oldest mother and father, and the oldest life, that the page counts as a problem. */
export const MIN_PARENT_AGE = 12;
export const MAX_MOTHER_AGE = 55;
export const MAX_FATHER_AGE = 75;
export const MAX_LIFE_YEARS = 110;

/** Ages are told apart only when both dates are known at least to the month. */
function datable(date: CheckDate): boolean {
    return date.precision === "day" || date.precision === "month";
}

/** Whole years from the first date to the second; a birthday not yet come is not counted. */
function yearsBetween(from: string, to: string): number {
    const [fy = 0, fm = 0, fd = 0] = from.split("-").map(Number);
    const [ty = 0, tm = 0, td = 0] = to.split("-").map(Number);
    let years = ty - fy;
    if (tm < fm || (tm === fm && td < fd)) years -= 1;
    return years;
}

const LOOSE_QUALIFIERS = new Set(["about", "estimated", "calculated"]);

/** A year earlier or later, on the same day (29 February becomes 28 February). */
function shiftYear(date: string, years: number): string {
    const [year = 0, month = "01", day = "01"] = date.split("-");
    const shifted = String(Number(year) + years).padStart(4, "0");
    return `${shifted}-${month}-${month === "02" && day === "29" ? "28" : day}`;
}

/**
 * The interval an age is judged on. "About", an estimate and a calculation are not a day to the
 * letter, so they are given a year of slack each way; the rest is read as interval() reads it.
 */
function ageInterval(date: CheckDate): Interval {
    const bounds = interval(date);
    if (!date.qualifier || !LOOSE_QUALIFIERS.has(date.qualifier)) return bounds;
    return {
        lo: bounds.lo ? shiftYear(bounds.lo, -1) : null,
        hi: bounds.hi ? shiftYear(bounds.hi, 1) : null,
    };
}

/**
 * The youngest and the oldest age a person can have had between two dates, in whole years, or null
 * where a bound is open. A page of doubts may only speak when the conclusion holds for every date
 * the two qualifiers allow: a mother born "before 1900" may be as old as anything.
 */
function ageRange(from: CheckDate, to: CheckDate): { min: number | null; max: number | null } {
    const start = ageInterval(from);
    const end = ageInterval(to);
    return {
        min: start.hi && end.lo ? yearsBetween(start.hi, end.lo) : null,
        max: start.lo && end.hi ? yearsBetween(start.lo, end.hi) : null,
    };
}

/**
 * Everything the archive finds doubtful. The list is ordered by code and by person, so it does not
 * jump about between two visits.
 */
export function findDataProblems(input: CheckInput): CheckIssue[] {
    const byId = new Map(input.persons.map((person) => [person.personId, person]));
    const issues: CheckIssue[] = [];
    const add = (issue: CheckIssue) => issues.push(issue);

    for (const person of input.persons) {
        const birth = interval(person.birth);
        const death = interval(person.death);

        // A death that clearly happened before the birth.
        if (birth.lo && death.hi && birth.lo > death.hi) {
            add({ code: "birthAfterDeath", personIds: [person.personId] });
        }

        // A life longer than any known one - even at its shortest the dates allow.
        const life = ageRange(person.birth, person.death);
        if (life.min !== null && life.min > MAX_LIFE_YEARS) {
            add({
                code: "implausibleAge",
                personIds: [person.personId],
                params: { age: life.min },
            });
        }

        // A date that has not happened yet.
        if (birth.lo && birth.lo > input.today) {
            add({ code: "futureBirth", personIds: [person.personId] });
        }
        if (death.lo && death.lo > input.today) {
            add({ code: "futureDeath", personIds: [person.personId] });
        }
    }

    // A child born before one of its parents.
    for (const edge of input.edges) {
        const child = byId.get(edge.childId);
        const parent = byId.get(edge.parentId);
        if (!child || !parent) continue;
        const childBirth = interval(child.birth);
        const parentBirth = interval(parent.birth);
        const parentDeath = interval(parent.death);

        if (childBirth.hi && parentBirth.lo && childBirth.hi < parentBirth.lo) {
            add({ code: "childBeforeParent", personIds: [child.personId, parent.personId] });
        }

        if (childBirth.lo && parentDeath.hi && childBirth.lo > parentDeath.hi) {
            // Only the mother is certain: a father may father a child after his death.
            if (parent.sex === "female") {
                add({
                    code: "childAfterMotherDeath",
                    personIds: [child.personId, parent.personId],
                });
            }
        }

        // The age of the parent when the child was born. Only a verdict that stands for every
        // pair of days the two dates allow is given, so an open bound ("before 1900") says nothing.
        if (datable(child.birth) && datable(parent.birth)) {
            const { min, max } = ageRange(parent.birth, child.birth);
            const mother = parent.sex === "female";
            const pair = [child.personId, parent.personId];
            if (max !== null && max >= 0 && max < MIN_PARENT_AGE) {
                add({
                    code: mother ? "motherTooYoung" : "fatherTooYoung",
                    personIds: pair,
                    params: { age: max },
                });
            } else if (min !== null && mother && min > MAX_MOTHER_AGE) {
                add({ code: "motherTooOld", personIds: pair, params: { age: min } });
            } else if (min !== null && !mother && min > MAX_FATHER_AGE) {
                add({ code: "fatherTooOld", personIds: pair, params: { age: min } });
            }
        }
    }

    // A union formed before one of its partners was born.
    for (const union of input.unions) {
        const marriage = interval(union.marriage);
        if (!marriage.hi) continue;
        for (const partnerId of union.partnerIds) {
            const partner = byId.get(partnerId);
            if (!partner) continue;
            const birth = interval(partner.birth);
            if (birth.lo && marriage.hi < birth.lo) {
                const seen = new Set([partnerId, ...union.partnerIds]);
                add({ code: "marriageBeforeBirth", personIds: [...seen] });
            }
        }
    }

    // Two births or two deaths on one person.
    for (const count of input.vitalCounts) {
        if (count.births > 1) {
            add({
                code: "duplicateBirth",
                personIds: [count.personId],
                params: { count: count.births },
            });
        }
        if (count.deaths > 1) {
            add({
                code: "duplicateDeath",
                personIds: [count.personId],
                params: { count: count.deaths },
            });
        }
    }

    return issues.sort(
        (a, b) =>
            a.code.localeCompare(b.code) ||
            (a.personIds[0] ?? "").localeCompare(b.personIds[0] ?? ""),
    );
}
