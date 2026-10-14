"use client";

/**
 * Familee - the owner's way to delete a whole tree.
 *
 * Two confirmations: the owner types the tree's address, and then confirms in the archive's own
 * dialog that names what goes: every person, photograph and file, and everything else in the tree.
 */

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { deleteTreeAction } from "@/lib/actions/removal";

export function DeleteTreeForm({
    slug,
    persons,
    photos,
}: {
    slug: string;
    persons: number;
    photos: number;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [typed, setTyped] = useState("");
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const matches = typed.trim() === slug;

    function onConfirm() {
        setAsking(false);
        setError(null);
        startTransition(async () => {
            const result = await deleteTreeAction({ slug, confirmSlug: typed.trim() });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.push("/trees");
        });
    }

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm">{t("tree.delete.warning", { persons, photos })}</p>
            <label className="flex flex-col gap-1.5">
                <span className="text-sm">{t("tree.delete.typeSlug", { slug })}</span>
                <input
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    className="input w-full max-w-xs"
                    autoComplete="off"
                />
            </label>
            <div>
                <button
                    type="button"
                    className="btn btn-error btn-sm"
                    disabled={!matches || pending}
                    onClick={() => setAsking(true)}
                >
                    <Trash2 className="size-4" />
                    {t("tree.delete.button")}
                </button>
            </div>
            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}
            <ConfirmDialog
                open={asking}
                title={t("tree.delete.dialogTitle")}
                message={t("tree.delete.dialogMessage")}
                confirmLabel={t("tree.delete.button")}
                danger
                onConfirm={onConfirm}
                onCancel={() => setAsking(false)}
            />
        </div>
    );
}
