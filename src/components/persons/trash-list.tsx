"use client";

/**
 * Familee - the trash: the people who were moved out of the tree
 *
 * Bringing someone back is a single click and changes nothing else. Removing them for good asks
 * once more, because that is the point where the photographs and their files go.
 */

import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { purgePersonAction, restorePersonAction } from "@/lib/actions/removal";

export type TrashRow = {
    personId: string;
    name: string;
    /** Already formatted for the reader. */
    when: string;
    /** The name of the member who moved the person out; empty when it is not known. */
    by: string;
};

export function TrashList({
    slug,
    canPurge,
    rows,
}: {
    slug: string;
    /** Whether the buttons of the permanent deletion are shown: the owner and the administrators. */
    canPurge: boolean;
    rows: TrashRow[];
}) {
    const t = useTranslations();
    const router = useRouter();
    const [asking, setAsking] = useState<TrashRow | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function restore(personId: string) {
        setError(null);
        startTransition(async () => {
            const result = await restorePersonAction({ slug, personId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    function purge(personId: string) {
        setAsking(null);
        setError(null);
        startTransition(async () => {
            const result = await purgePersonAction({ slug, personId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    if (rows.length === 0)
        return <p className="text-base-content/60 text-sm">{t("trash.empty")}</p>;

    return (
        <div className="flex flex-col gap-3">
            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}
            <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                {rows.map((row) => (
                    <li
                        key={row.personId}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                        <span className="flex min-w-0 flex-col">
                            <span className="font-medium text-sm">
                                {row.name || t("common.unknown")}
                            </span>
                            <span className="text-base-content/60 text-xs">
                                {t("trash.deletedAt", { when: row.when })}
                                {row.by ? ` · ${t("trash.deletedBy", { name: row.by })}` : ""}
                            </span>
                        </span>
                        <span className="flex items-center gap-2">
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={pending}
                                onClick={() => restore(row.personId)}
                            >
                                <RotateCcw className="size-4" />
                                {t("trash.restore")}
                            </button>
                            {canPurge && (
                                <button
                                    type="button"
                                    className="btn btn-outline btn-error btn-sm"
                                    disabled={pending}
                                    onClick={() => setAsking(row)}
                                >
                                    <Trash2 className="size-4" />
                                    {t("trash.purge")}
                                </button>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
            <ConfirmDialog
                open={asking !== null}
                title={t("trash.purgeTitle")}
                message={t("trash.purgeWarning", { name: asking?.name ?? "" })}
                confirmLabel={t("trash.purge")}
                danger
                onConfirm={() => {
                    if (asking) purge(asking.personId);
                }}
                onCancel={() => setAsking(null)}
            />
        </div>
    );
}
