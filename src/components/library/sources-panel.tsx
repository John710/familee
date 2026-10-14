"use client";

/**
 * Familee - the sources of the archive: the books, documents and sites the facts come from.
 *
 * Everybody sees the list; editors add, change and remove. A source is cited by the people and
 * events it proves (see the person's page). The server checks every write again.
 */

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { deleteSourceAction, type SourceInput, saveSourceAction } from "@/lib/actions/library";

export type SourceRow = {
    id: string;
    title: string;
    author: string | null;
    publication: string | null;
    url: string | null;
    textExcerpt: string | null;
};

export function SourcesPanel({
    slug,
    sources,
    canEdit,
}: {
    slug: string;
    sources: SourceRow[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [editing, setEditing] = useState<{ id: string | null } | null>(null);
    const [removing, setRemoving] = useState<SourceRow | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onSave(event: FormEvent<HTMLFormElement>, id: string | null) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const input: SourceInput = {
            slug,
            id,
            title: String(form.get("title") ?? ""),
            author: String(form.get("author") ?? ""),
            publication: String(form.get("publication") ?? ""),
            url: String(form.get("url") ?? ""),
            textExcerpt: String(form.get("textExcerpt") ?? ""),
        };
        setError(null);
        startTransition(async () => {
            const result = await saveSourceAction(input);
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            setEditing(null);
            router.refresh();
        });
    }

    function confirmRemoval() {
        if (!removing) return;
        const target = removing;
        setRemoving(null);
        startTransition(async () => {
            const result = await deleteSourceAction({ slug, id: target.id });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    const current = editing?.id
        ? (sources.find((source) => source.id === editing.id) ?? null)
        : null;

    return (
        <div className="flex flex-col gap-5">
            {canEdit && editing === null && (
                <button
                    type="button"
                    className="btn btn-primary btn-sm w-fit"
                    onClick={() => setEditing({ id: null })}
                >
                    <Plus className="size-4" />
                    {t("source.add")}
                </button>
            )}

            {editing && (
                <form
                    onSubmit={(event) => onSave(event, editing.id)}
                    className="card card-border grid gap-3 bg-base-100 p-4 sm:grid-cols-2"
                >
                    <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-xs">{t("source.fields.title")}</span>
                        <input
                            name="title"
                            defaultValue={current?.title ?? ""}
                            required
                            className="input"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs">{t("source.fields.author")}</span>
                        <input
                            name="author"
                            defaultValue={current?.author ?? ""}
                            className="input"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs">{t("source.fields.publication")}</span>
                        <input
                            name="publication"
                            defaultValue={current?.publication ?? ""}
                            className="input"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs">{t("source.fields.url")}</span>
                        <input
                            name="url"
                            type="url"
                            defaultValue={current?.url ?? ""}
                            className="input"
                        />
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-xs">{t("source.fields.text")}</span>
                        <textarea
                            name="textExcerpt"
                            defaultValue={current?.textExcerpt ?? ""}
                            rows={2}
                            className="textarea"
                        />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
                            {t("common.save")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing(null)}
                        >
                            {t("common.cancel")}
                        </button>
                    </div>
                </form>
            )}

            {sources.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("source.empty")}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                    {sources.map((source) => (
                        <li
                            key={source.id}
                            className="flex items-start justify-between gap-3 px-4 py-3"
                        >
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="font-medium text-sm">{source.title}</span>
                                {(source.author || source.publication) && (
                                    <span className="text-base-content/60 text-xs">
                                        {[source.author, source.publication]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                )}
                                {source.textExcerpt && (
                                    <span className="whitespace-pre-line text-xs">
                                        {source.textExcerpt}
                                    </span>
                                )}
                                {source.url && (
                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="link inline-flex items-center gap-1 text-xs"
                                    >
                                        <ExternalLink className="size-3" />
                                        {t("source.fields.url")}
                                    </a>
                                )}
                            </div>
                            {canEdit && (
                                <div className="flex shrink-0 gap-1">
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-xs btn-square"
                                        aria-label={t("source.edit")}
                                        disabled={pending || editing !== null}
                                        onClick={() => setEditing({ id: source.id })}
                                    >
                                        <Pencil className="size-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-xs btn-square text-error"
                                        aria-label={t("common.remove")}
                                        disabled={pending || editing !== null}
                                        onClick={() => setRemoving(source)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={removing !== null}
                title={t("source.removeTitle")}
                message={t("source.removeConfirm")}
                confirmLabel={t("common.remove")}
                danger
                onConfirm={confirmRemoval}
                onCancel={() => setRemoving(null)}
            />
        </div>
    );
}
