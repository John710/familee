"use client";

/**
 * Familee - the groups of places (or of sources) that look like one record entered twice
 *
 * The archive never merges anything on its own. It shows the groups; the reader picks the record
 * that stays and the others move into it, one call per record. A place takes its events, its media
 * and its notes with it; a source takes its citations. The same shape as the list of people who look
 * like one (components/persons/duplicate-list.tsx), for the two kinds of record that carry no name of
 * their own.
 */

import { GitMerge } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { mergePlacesAction, mergeSourcesAction } from "@/lib/actions/merge";

export type RecordDuplicateEntry = {
    id: string;
    /** The name of the place, or the title of the source. */
    label: string;
    /** What tells two records of the group apart: the full name, the author, the call number... */
    detail: string;
    /** How much points at the record, so the reader can guess which one is the real one. */
    uses: number;
};

export type RecordDuplicateGroup = {
    key: string;
    entries: RecordDuplicateEntry[];
};

export function RecordDuplicateList({
    slug,
    kind,
    groups,
    empty,
}: {
    slug: string;
    kind: "place" | "source";
    groups: RecordDuplicateGroup[];
    /** What to say when there is nothing to merge. */
    empty: string;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [asking, setAsking] = useState<{
        keep: RecordDuplicateEntry;
        group: RecordDuplicateGroup;
    } | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function merge(keep: RecordDuplicateEntry, group: RecordDuplicateGroup) {
        setAsking(null);
        setError(null);
        setNote(null);

        startTransition(async () => {
            let records = 0;
            let moved = 0;
            for (const entry of group.entries) {
                if (entry.id === keep.id) continue;

                const result =
                    kind === "place"
                        ? await mergePlacesAction({ slug, keepId: keep.id, dropId: entry.id })
                        : await mergeSourcesAction({ slug, keepId: keep.id, dropId: entry.id });
                if (!result.ok) {
                    setError(t(result.error as Parameters<typeof t>[0]));
                    return;
                }
                records += 1;
                moved += result.moved;
            }

            setNote(t("duplicates.mergedRecords", { count: records, moved }));
            router.refresh();
        });
    }

    if (groups.length === 0) {
        return <p className="text-base-content/60 text-sm">{empty}</p>;
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
                            <h3 className="font-medium">{group.entries[0]?.label}</h3>

                            <ul className="flex flex-col divide-y divide-base-300">
                                {group.entries.map((entry) => (
                                    <li
                                        key={entry.id}
                                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                                    >
                                        <span className="flex min-w-0 flex-col">
                                            <span className="text-sm">{entry.label}</span>
                                            <span className="text-base-content/60 text-xs">
                                                {[
                                                    entry.detail,
                                                    t("duplicates.uses", { count: entry.uses }),
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            disabled={pending}
                                            onClick={() => setAsking({ keep: entry, group })}
                                        >
                                            <GitMerge className="size-4" />
                                            {t("duplicates.keepRecord")}
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
                title={t("duplicates.confirmRecordTitle")}
                message={t("duplicates.confirmRecordMessage", {
                    count: (asking?.group.entries.length ?? 1) - 1,
                    name: asking?.keep.label ?? "",
                })}
                confirmLabel={t("duplicates.keepRecord")}
                danger
                onConfirm={() => {
                    if (asking) merge(asking.keep, asking.group);
                }}
                onCancel={() => setAsking(null)}
            />
        </div>
    );
}
