"use client";

/**
 * Familee - the unions of a person: the partners and the children of each.
 *
 * The lists come from the server; the forms call the union actions and refresh
 * the page on success. Nothing here decides a rule: the database checks have the
 * last word and their messages are shown as they are translated.
 */

import { Heart, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { addChildAction, createUnionAction } from "@/lib/actions/unions";

export type UnionItem = {
    familyId: string;
    type: string;
    partner: { personId: string; name: string } | null;
    children: { personId: string; name: string; relation: string }[];
};

export type PersonOption = { personId: string; name: string };

const UNION_TYPES = ["marriage", "partnership", "civil_union", "single_parent", "unknown"] as const;
const RELATIONS = [
    "biological",
    "adopted",
    "step",
    "foster",
    "guardianship",
    "sealing",
    "unknown",
] as const;

type UnionType = (typeof UNION_TYPES)[number];
type Relation = (typeof RELATIONS)[number];

export function FamilyPanel({
    slug,
    personId,
    unions,
    options,
}: {
    slug: string;
    personId: string;
    unions: UnionItem[];
    /** Everybody in the tree except this person. */
    options: PersonOption[];
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onAddUnion(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const partnerId = String(form.get("partner") ?? "");
        const type = String(form.get("type") ?? "marriage");

        setError(null);
        startTransition(async () => {
            const result = await createUnionAction({
                slug,
                personId,
                partnerId: partnerId === "" ? null : partnerId,
                type,
            });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            formElement.reset();
            router.refresh();
        });
    }

    function onAddChild(event: FormEvent<HTMLFormElement>, familyId: string) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const childId = String(form.get("child") ?? "");
        const relation = String(form.get("relation") ?? "biological");
        if (childId === "") return;

        setError(null);
        startTransition(async () => {
            const result = await addChildAction({ slug, familyId, childId, relation });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            formElement.reset();
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-6">
            {unions.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("family.none")}</p>
            ) : (
                <ul className="flex flex-col gap-4">
                    {unions.map((union) => (
                        <li key={union.familyId} className="rounded-box border border-base-300 p-4">
                            <div className="flex items-center gap-2 font-medium">
                                <Heart className="size-4 text-primary" />
                                <span>
                                    {union.partner ? union.partner.name : t("family.noPartner")}
                                </span>
                                <span className="text-base-content/60 text-xs">
                                    · {t(`enums.family_type.${union.type as UnionType}`)}
                                </span>
                            </div>

                            <ul className="mt-3 flex flex-col gap-1 text-sm">
                                {union.children.length === 0 ? (
                                    <li className="text-base-content/60">
                                        {t("family.noChildren")}
                                    </li>
                                ) : (
                                    union.children.map((child) => (
                                        <li
                                            key={child.personId}
                                            className="flex items-center gap-2"
                                        >
                                            <span>{child.name}</span>
                                            <span className="text-base-content/60 text-xs">
                                                {t(
                                                    `enums.child_relation.${child.relation as Relation}`,
                                                )}
                                            </span>
                                        </li>
                                    ))
                                )}
                            </ul>

                            <form
                                onSubmit={(event) => onAddChild(event, union.familyId)}
                                className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
                            >
                                <select name="child" className="select w-full" defaultValue="">
                                    <option value="" disabled>
                                        {t("family.chooseChild")}
                                    </option>
                                    {options.map((option) => (
                                        <option key={option.personId} value={option.personId}>
                                            {option.name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    name="relation"
                                    defaultValue="biological"
                                    className="select w-full"
                                >
                                    {RELATIONS.map((relation) => (
                                        <option key={relation} value={relation}>
                                            {t(`enums.child_relation.${relation}`)}
                                        </option>
                                    ))}
                                </select>
                                <button type="submit" className="btn btn-sm" disabled={pending}>
                                    <UserPlus className="size-4" />
                                    {t("family.addChild")}
                                </button>
                            </form>
                        </li>
                    ))}
                </ul>
            )}

            <form onSubmit={onAddUnion} className="card card-border bg-base-100">
                <div className="card-body gap-3">
                    <h3 className="font-semibold">{t("family.add")}</h3>
                    <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                        <select name="partner" defaultValue="" className="select w-full">
                            <option value="">{t("family.noPartner")}</option>
                            {options.map((option) => (
                                <option key={option.personId} value={option.personId}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                        <select name="type" defaultValue="marriage" className="select w-full">
                            {UNION_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {t(`enums.family_type.${type}`)}
                                </option>
                            ))}
                        </select>
                        <button type="submit" className="btn btn-primary" disabled={pending}>
                            {t("family.addPartner")}
                        </button>
                    </div>
                    {error && (
                        <p role="alert" className="text-error text-sm">
                            {error}
                        </p>
                    )}
                </div>
            </form>
        </div>
    );
}
