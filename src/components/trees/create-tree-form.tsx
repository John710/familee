"use client";

/**
 * Familee - the form that creates a tree.
 *
 * The address of a tree (the slug) is typed by hand: it becomes part of the URL
 * and should stay readable. The server checks the format and the uniqueness.
 */

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { createTreeAction } from "@/lib/actions/trees";

export function CreateTreeForm() {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "");
        const slug = String(form.get("slug") ?? "");

        setError(null);
        startTransition(async () => {
            const result = await createTreeAction({ title, slug });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.push(`/trees/${result.slug}/members`);
        });
    }

    return (
        <form onSubmit={onSubmit} className="card card-border bg-base-100">
            <div className="card-body gap-4">
                <h2 className="font-semibold text-lg">{t("tree.create")}</h2>

                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("tree.fields.name")}</span>
                    <input name="title" required maxLength={200} className="input w-full" />
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("tree.fields.slug")}</span>
                    <input name="slug" required maxLength={63} className="input w-full font-mono" />
                    <span className="text-base-content/60 text-xs">
                        {t("tree.fields.slugHint")}
                    </span>
                </label>

                {error && (
                    <p role="alert" className="text-error text-sm">
                        {error}
                    </p>
                )}

                <button type="submit" className="btn btn-primary self-start" disabled={pending}>
                    <Plus className="size-4" />
                    {t("common.create")}
                </button>
            </div>
        </form>
    );
}
