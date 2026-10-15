"use client";

/**
 * Familee - the groups of people who look like one person entered twice
 *
 * The archive never merges anything on its own: it shows the groups, and the person who knows the
 * family decides which record stays. The merge itself is one call per superfluous record.
 */

import { GitMerge } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { mergePersonsAction } from "@/lib/actions/merge";

export type DuplicateEntry = {
    personId: string;
    name: string;
    /** The years as the cards show them; empty when there are none. */
    years: string;
};

export type DuplicateGroupView = {
    key: string;
    sameBirthYear: boolean;
    sameDeathYear: boolean;
    birthYearsUnknown: boolean;
    persons: DuplicateEntry[];
};

export function DuplicateList({ slug, groups }: { slug: string; groups: DuplicateGroupView[] }) {
    const t = useTranslations();
    const router = useRouter();
    const [asking, setAsking] = useState<{
        keep: DuplicateEntry;
        group: DuplicateGroupView;
    } | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function merge(keep: DuplicateEntry, group: DuplicateGroupView) {
        setAsking(null);
        setError(null);
        setNote(null);

        startTransition(async () => {
            const moved = { count: 0, names: 0, events: 0, photos: 0, unions: 0 };
            for (const person of group.persons) {
                if (person.personId === keep.personId) continue;

                const result = await mergePersonsAction({
                    slug,
                    keepId: keep.personId,
                    dropId: person.personId,
                });
                if (!result.ok) {
                    setError(t(result.error as Parameters<typeof t>[0]));
                    return;
                }
                moved.count += 1;
                moved.names += result.names;
                moved.events += result.events;
                moved.photos += result.photos;
                moved.unions += result.unions;
            }

            setNote(t("duplicates.merged", moved));
            router.refresh();
        });
    }

    // Why the people of one group look alike, as one line for the reader.
    const reasonOf = (group: DuplicateGroupView): string => {
        const parts: string[] = [];
        if (group.sameBirthYear) parts.push(t("duplicates.sameBirthYear"));
        if (group.birthYearsUnknown) parts.push(t("duplicates.birthYearsUnknown"));
        if (group.sameDeathYear) parts.push(t("duplicates.sameDeathYear"));
        return parts.length > 0 ? parts.join(", ") : t("duplicates.sameName");
    };

    if (groups.length === 0) {
        return <p className="text-base-content/60 text-sm">{t("duplicates.empty")}</p>;
    }

    return (
        <div className="flex flex-col gap-4">
            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}
            {note && (
                <p role="status" className="text-sm text-success">
                    {note}
                </p>
            )}

            <ul className="flex flex-col gap-4">
                {groups.map((group) => (
                    <li key={group.key} className="card card-border bg-base-100">
                        <div className="card-body gap-3 p-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className="font-medium">
                                    {group.persons[0]?.name || t("common.unknown")}
                                </h2>
                                <span className="text-base-content/60 text-xs">
                                    {t("duplicates.because")}: {reasonOf(group)}
                                </span>
                            </div>

                            <ul className="flex flex-col divide-y divide-base-300">
                                {group.persons.map((person) => (
                                    <li
                                        key={person.personId}
                                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                                    >
                                        <span className="flex min-w-0 flex-col">
                                            <Link
                                                href={`/trees/${slug}/persons/${person.personId}`}
                                                className="link text-sm"
                                            >
                                                {person.name || t("common.unknown")}
                                            </Link>
                                            {person.years && (
                                                <span className="text-base-content/60 text-xs">
                                                    {person.years}
                                                </span>
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            disabled={pending}
                                            onClick={() => setAsking({ keep: person, group })}
                                        >
                                            <GitMerge className="size-4" />
                                            {t("duplicates.keep")}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </li>
                ))}
            </ul>

            <ConfirmDialog
                open={asking !== null}
                title={t("duplicates.confirmTitle")}
                message={t("duplicates.confirmMessage", {
                    count: (asking?.group.persons.length ?? 1) - 1,
                    name: asking?.keep.name || t("common.unknown"),
                })}
                confirmLabel={t("duplicates.keep")}
                danger
                onConfirm={() => {
                    if (asking) merge(asking.keep, asking.group);
                }}
                onCancel={() => setAsking(null)}
            />
        </div>
    );
}
