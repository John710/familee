/**
 * Familee - the people who look like one person entered twice
 *
 * A tree receives the same ancestor from several hands: a GEDCOM file of one branch, a copy of
 * another, an entry typed from memory. The names come out spelled differently and the years differ,
 * so an exact comparison finds nothing. What is compared here is the name without its case and its
 * diacritics plus the years of the birth and the death: an equal name whose birth years contradict
 * each other cannot be the same person, an equal name without years can.
 *
 * Pure functions, no database and no translations: the duplicates page and the import preview both
 * read the same answer.
 */

/** The fields the comparison needs; a tree card and a planned person both have them. */
export type DuplicatePerson = {
    personId: string;
    fullName: string | null;
    surname: string | null;
    given: string | null;
    patronymic: string | null;
    birthYear: number | null;
    deathYear: number | null;
};

/** A card of person_cards, narrowed to the fields the comparison reads. */
export function cardToDuplicate(card: DuplicatePerson): DuplicatePerson {
    return {
        personId: card.personId,
        fullName: card.fullName,
        surname: card.surname,
        given: card.given,
        patronymic: card.patronymic,
        birthYear: card.birthYear,
        deathYear: card.deathYear,
    };
}

export type DuplicateGroup = {
    /** The name all of them share, as it was normalized. */
    key: string;
    /** The people of the group; the first one is the one the others were compared with. */
    persons: DuplicatePerson[];
    /** How alike they are, for the reader: the shared years, if any. */
    sameBirthYear: boolean;
    sameDeathYear: boolean;
    /** True when not one of them gives a year of birth. */
    birthYearsUnknown: boolean;
};

const SCORE_NAME = 3;
const SCORE_SAME_BIRTH = 2;
const SCORE_OTHER_BIRTH = -2;
const SCORE_SAME_DEATH = 1;
const SCORE_OTHER_DEATH = -1;

/**
 * The name as it is compared: lower case, without accents or diacritics (so "ё" meets "е"), without
 * punctuation and with the spaces collapsed. The patronymic is left out on purpose - one record
 * often carries it and the other does not.
 */
export function nameKey(person: DuplicatePerson): string {
    const surname = normalize(person.surname ?? "");
    const given = normalize(person.given ?? "");
    const parts = [surname, given].filter((part) => part !== "");
    if (parts.length > 0) return parts.join(" ");
    return normalize(person.fullName ?? "");
}

/**
 * How much two people look like one: 0 when they cannot be the same person, otherwise 3 or more.
 * An equal name is worth 3; the birth year moves the answer by 2 in either direction, which is why
 * an equal name with a contradicting birth year falls under the bar, and the death year by 1.
 */
export function duplicateScore(a: DuplicatePerson, b: DuplicatePerson): number {
    const key = nameKey(a);
    if (key === "" || key !== nameKey(b)) return 0;

    let score = SCORE_NAME;
    if (a.birthYear !== null && b.birthYear !== null) {
        score += a.birthYear === b.birthYear ? SCORE_SAME_BIRTH : SCORE_OTHER_BIRTH;
    }
    if (a.deathYear !== null && b.deathYear !== null) {
        score += a.deathYear === b.deathYear ? SCORE_SAME_DEATH : SCORE_OTHER_DEATH;
    }
    return score >= SCORE_NAME ? score : 0;
}

/** The people of one tree, grouped by the name they share. */
export function indexByName(persons: DuplicatePerson[]): Map<string, DuplicatePerson[]> {
    const index = new Map<string, DuplicatePerson[]>();
    for (const person of persons) {
        const key = nameKey(person);
        if (key === "") continue;
        const list = index.get(key);
        if (list) list.push(person);
        else index.set(key, [person]);
    }
    return index;
}

/** The person of a tree who looks most like this one, or null when nobody does. */
export function bestMatch(
    person: DuplicatePerson,
    index: Map<string, DuplicatePerson[]>,
): DuplicatePerson | null {
    const candidates = index.get(nameKey(person));
    if (!candidates) return null;

    let best: DuplicatePerson | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
        const score = duplicateScore(person, candidate);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}

/**
 * The groups of a tree in which two or more people look like one. People with the same name are
 * clustered around the first of them, so a name that three records share gives one group of three
 * and not three groups.
 */
export function findDuplicates(persons: DuplicatePerson[]): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];

    for (const [key, byName] of indexByName(persons)) {
        if (byName.length < 2) continue;

        // The earliest birth first, so the group has a stable head.
        const sorted = [...byName].sort(byBirthYear);

        const clusters: { head: DuplicatePerson; members: DuplicatePerson[] }[] = [];
        for (const person of sorted) {
            const cluster = clusters.find(
                (candidate) => duplicateScore(candidate.head, person) > 0,
            );
            if (cluster) cluster.members.push(person);
            else clusters.push({ head: person, members: [person] });
        }

        for (const cluster of clusters) {
            if (cluster.members.length < 2) continue;
            groups.push({
                key,
                persons: cluster.members,
                sameBirthYear: cluster.members.some(
                    (person) =>
                        person !== cluster.head &&
                        person.birthYear !== null &&
                        person.birthYear === cluster.head.birthYear,
                ),
                sameDeathYear: cluster.members.some(
                    (person) =>
                        person !== cluster.head &&
                        person.deathYear !== null &&
                        person.deathYear === cluster.head.deathYear,
                ),
                birthYearsUnknown:
                    cluster.head.birthYear === null &&
                    cluster.members.every((person) => person.birthYear === null),
            });
        }
    }

    return groups.sort(
        (a, b) =>
            b.persons.length - a.persons.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
}

/**
 * The groups of records whose text is the same once it is normalized: a place entered as "Tula" and
 * as "tula, " is one place, and two sources whose titles are written the same way are one source.
 * A group of one is left out, and the biggest group comes first, so the reader starts where there is
 * the most to clean. The same normalization as for names is used: case, accents and punctuation do
 * not count.
 */
export function groupByText<T>(records: T[], textOf: (record: T) => string): T[][] {
    const groups = new Map<string, T[]>();
    for (const record of records) {
        const key = normalize(textOf(record));
        if (key === "") continue;
        const list = groups.get(key);
        if (list) list.push(record);
        else groups.set(key, [record]);
    }
    return [...groups.values()]
        .filter((group) => group.length > 1)
        .sort((a, b) => b.length - a.length);
}

/** The year inside a date as a file writes it: "12.04.1921" or "1921". */
export function yearOf(value: string): number | null {
    const match = /(\d{4})/.exec(value);
    if (!match?.[1]) return null;
    const year = Number(match[1]);
    return Number.isFinite(year) ? year : null;
}

function byBirthYear(a: DuplicatePerson, b: DuplicatePerson): number {
    if (a.birthYear === null && b.birthYear === null) return 0;
    if (a.birthYear === null) return 1;
    if (b.birthYear === null) return -1;
    return a.birthYear - b.birthYear;
}

/** Lower case, without the marks that carry accents or the Cyrillic "ё", without punctuation. */
function normalize(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}
