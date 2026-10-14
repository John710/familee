/**
 * Familee - the phrase for how a person is related to the signed-in person
 *
 * The phrase is composed from the kinship.* messages: the sex of the person picks the words (uncle
 * or aunt, son or daughter), the degrees the numbers. The tree's cards and the person's page both
 * use it, so the two always say the same thing.
 */

import type { Relation } from "@/lib/kinship";

/** The translator of the current request or of the browser: a message key with its values. */
export type Translator = (key: string, values?: Record<string, string | number>) => string;

export function relationPhrase(
    relation: Relation | null,
    sex: string,
    t: Translator,
): string | null {
    if (!relation || relation.kind === "self") return null;
    const key = (n: number) => (n <= 4 ? String(n) : "other");

    if (relation.kind === "spouse") return t("kinship.spouse", { sex });

    // The blood relation of the person, or of the blood relative a spouse is married to.
    const blood = (up: number, down: number): string => {
        if (down === 0) return t(`kinship.ancestor.${key(up)}`, { sex, degree: up });
        if (up === 0) return t(`kinship.descendant.${key(down)}`, { sex, degree: down });
        if (up === 1 && down === 1) return t("kinship.sibling", { sex });
        if (down === 1) {
            // The person is a sibling of one of the ancestors: an uncle or aunt, a great-uncle...
            return t(`kinship.auncle.${up <= 3 ? up : "other"}`, { sex });
        }
        if (up === 1) {
            // The person is a child of a sibling: a nephew or niece, a great-nephew...
            return t(`kinship.nibling.${down <= 3 ? down : "other"}`, { sex });
        }
        // Both sides are at least two generations away: cousins, once removed when the sides differ.
        const degree = Math.min(up, down) - 1;
        const base = t(`kinship.cousin.${degree <= 3 ? degree : "other"}`, { sex, degree });
        if (up === down) return base;
        return t("kinship.removed", { base, count: Math.abs(up - down) });
    };

    if (relation.kind === "inLaw") {
        return t("kinship.inLaw", { base: blood(relation.up, relation.down) });
    }
    return blood(relation.up, relation.down);
}
