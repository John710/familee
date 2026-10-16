"use client";

/**
 * Familee - the sources cited for one event of a person (the baptism, the occupation...).
 *
 * Shown under the event in the records panel. Editors add a citation with a source, a page and
 * an excerpt, and remove one; the server checks that the event belongs to the person and that
 * the source belongs to the tree, and writes the audit log entry.
 */

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { deleteEventCitationAction, saveEventCitationAction } from "@/lib/actions/library";

export type EventCitationRow = {
    id: string;
    sourceTitle: string;
    page: string | null;
    textExcerpt: string | null;
};

export function EventCitations({
    slug,
    owner,
    eventId,
    citations,
    sources,
    canEdit,
}: {
    slug: string;
    /** Whose event it is: a person's or a union's; it decides which list the write is checked on. */
    owner: { personId: string } | { familyId: string };
    eventId: string;
    citations: EventCitationRow[];
    sources: { id: string; title: string }[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onAdd(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
            const result = await saveEventCitationAction({
                slug,
                ...owner,
                eventId,
                sourceId: String(form.get("sourceId") ?? ""),
                page: String(form.get("page") ?? ""),
                textExcerpt: String(form.get("textExcerpt") ?? ""),
            });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            setAdding(false);
            router.refresh();
        });
    }

    function onRemove(citationId: string) {
        setError(null);
        startTransition(async () => {
            const result = await deleteEventCitationAction({ slug, ...owner, citationId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-2">
            {citations.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                    {citations.map((citation) => (
                        <li
                            key={citation.id}
                            className="flex items-start justify-between gap-2 text-xs"
                        >
                            <span className="flex min-w-0 flex-col">
                                <span className="font-medium">
                                    {citation.sourceTitle}
                                    {citation.page ? ` · ${citation.page}` : ""}
                                </span>
                                {citation.textExcerpt && (
                                    <span className="whitespace-pre-line text-base-content/70 italic">
                                        {citation.textExcerpt}
                                    </span>
                                )}
                            </span>
                            {canEdit && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-xs btn-square text-error"
                                    aria-label={t("common.remove")}
                                    disabled={pending}
                                    onClick={() => onRemove(citation.id)}
                                >
                                    <Trash2 className="size-3" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canEdit && !adding && sources.length > 0 && (
                <button
                    type="button"
                    className="btn btn-ghost btn-xs w-fit"
                    onClick={() => setAdding(true)}
                >
                    <Plus className="size-3" />
                    {t("citation.add")}
                </button>
            )}

            {adding && (
                <form onSubmit={onAdd} className="grid gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs">{t("source.one")}</span>
                        <select name="sourceId" required className="select select-sm">
                            {sources.map((source) => (
                                <option key={source.id} value={source.id}>
                                    {source.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs">{t("citation.fields.page")}</span>
                        <input name="page" className="input input-sm" />
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-xs">{t("citation.fields.text")}</span>
                        <textarea name="textExcerpt" rows={2} className="textarea textarea-sm" />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                        <button type="submit" className="btn btn-primary btn-xs" disabled={pending}>
                            {t("common.save")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => setAdding(false)}
                        >
                            {t("common.cancel")}
                        </button>
                    </div>
                </form>
            )}

            {error && (
                <p role="alert" className="text-error text-xs">
                    {error}
                </p>
            )}
        </div>
    );
}
