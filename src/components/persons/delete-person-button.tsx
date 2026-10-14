"use client";

/**
 * Familee - the button that deletes one person with all of his data.
 *
 * The warning is the archive's own confirmation dialog: it names the photographs that will go with
 * the person. The server checks the role again and deletes; on success the page goes back to the list.
 */

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { deletePersonAction } from "@/lib/actions/removal";

export function DeletePersonButton({
    slug,
    personId,
    photos,
}: {
    slug: string;
    personId: string;
    /** How many photographs the person has, shown in the warning. */
    photos: number;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onConfirm() {
        setAsking(false);
        setError(null);
        startTransition(async () => {
            const result = await deletePersonAction({ slug, personId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.push(`/trees/${slug}/persons`);
        });
    }

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                className="btn btn-outline btn-error btn-sm w-fit"
                disabled={pending}
                onClick={() => setAsking(true)}
            >
                <Trash2 className="size-4" />
                {t("person.delete.button")}
            </button>
            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}
            <ConfirmDialog
                open={asking}
                title={t("person.delete.title")}
                message={t("person.delete.warning", { photos })}
                confirmLabel={t("person.delete.button")}
                danger
                onConfirm={onConfirm}
                onCancel={() => setAsking(false)}
            />
        </div>
    );
}
