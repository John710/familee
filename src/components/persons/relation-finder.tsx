"use client";

/**
 * Familee - "how is this person related to that one"
 *
 * The person page already says how the person is related to the signed-in member, in the words of
 * the tree. This panel answers the other question: pick any person of the tree and see what the
 * page's person is to them. The relation comes from the pure functions of src/lib/kinship.ts, so
 * the two places can never disagree.
 */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { type KinshipFamily, relationBetween } from "@/lib/kinship";
import { relationPhrase, type Translator } from "@/lib/kinship-phrase";

export function RelationFinder({
    personId,
    personSex,
    people,
    families,
}: {
    personId: string;
    personSex: string;
    people: { personId: string; name: string }[];
    families: KinshipFamily[];
}) {
    const t = useTranslations();
    const [otherId, setOtherId] = useState("");

    const phrase = useMemo(() => {
        if (!otherId) return null;
        const relation = relationBetween(personId, otherId, families);
        return (
            relationPhrase(relation, personSex, t as unknown as Translator) ??
            t("kinship.unrelated")
        );
    }, [otherId, personId, personSex, families, t]);

    return (
        <section className="card card-border bg-base-100">
            <div className="card-body gap-3">
                <h2 className="font-semibold text-lg">{t("kinship.with")}</h2>
                <select
                    className="select w-full max-w-md"
                    aria-label={t("kinship.with")}
                    value={otherId}
                    onChange={(event) => setOtherId(event.target.value)}
                >
                    <option value="">{t("kinship.choose")}</option>
                    {people.map((person) => (
                        <option key={person.personId} value={person.personId}>
                            {person.name}
                        </option>
                    ))}
                </select>
                {phrase && <p className="text-lg">{phrase}</p>}
            </div>
        </section>
    );
}
