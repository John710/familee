"use client";

/**
 * Familee - the notes and stories about a person, and the sources they are cited for.
 *
 * Everybody reads them on the person's page; in the edit mode editors write them. A citation
 * names the source, the page or place in it, and the words taken from it. The server checks
 * every write again.
 */

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import {
    deleteCitationAction,
    deleteNoteAction,
    saveCitationAction,
    saveNoteAction,
} from "@/lib/actions/library";

export type NoteRow = { id: string; title: string | null; body: string };
export type CitationRow = {
    id: string;
    sourceTitle: string;
    page: string | null;
    textExcerpt: string | null;
};
export type SourceOption = { id: string; title: string };

type Removal = { kind: "note" | "citation"; id: string } | null;

export function PersonLibraryPanel({
    slug,
    personId,
    notes,
    citations,
    sources,
    canEdit,
}: {
    slug: string;
    personId: string;
    notes: NoteRow[];
    citations: CitationRow[];
    sources: SourceOption[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [editingNote, setEditingNote] = useState<{ id: string | null } | null>(null);
    const [addingCitation, setAddingCitation] = useState(false);
    const [removal, setRemoval] = useState<Removal>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function finish(result: { ok: true } | { ok: false; error: string }, done?: () => void) {
        if (!result.ok) {
            setError(t(result.error as Parameters<typeof t>[0]));
            return;
        }
        done?.();
        router.refresh();
    }

    function onSaveNote(event: FormEvent<HTMLFormElement>, id: string | null) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
            finish(
                await saveNoteAction({
                    slug,
                    personId,
                    id,
                    title: String(form.get("title") ?? ""),
                    body: String(form.get("body") ?? ""),
                }),
                () => setEditingNote(null),
            );
        });
    }

    function onSaveCitation(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
            finish(
                await saveCitationAction({
                    slug,
                    personId,
                    sourceId: String(form.get("sourceId") ?? ""),
                    page: String(form.get("page") ?? ""),
                    textExcerpt: String(form.get("textExcerpt") ?? ""),
                }),
                () => setAddingCitation(false),
            );
        });
    }

    function confirmRemoval() {
        if (!removal) return;
        const target = removal;
        setRemoval(null);
        startTransition(async () => {
            finish(
                target.kind === "note"
                    ? await deleteNoteAction({ slug, personId, id: target.id })
                    : await deleteCitationAction({ slug, personId, citationId: target.id }),
            );
        });
    }

    const editedNote = editingNote?.id ? notes.find((note) => note.id === editingNote.id) : null;

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{t("library.notes")}</h3>
                    {canEdit && editingNote === null && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditingNote({ id: null })}
                        >
                            <Plus className="size-4" />
                            {t("library.addNote")}
                        </button>
                    )}
                </div>

                {editingNote && (
                    <form
                        onSubmit={(event) => onSaveNote(event, editingNote.id)}
                        className="card card-border grid gap-3 bg-base-100 p-4"
                    >
                        <label className="flex flex-col gap-1">
                            <span className="text-xs">{t("library.noteTitle")}</span>
                            <input
                                name="title"
                                defaultValue={editedNote?.title ?? ""}
                                className="input"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs">{t("library.noteBody")}</span>
                            <textarea
                                name="body"
                                defaultValue={editedNote?.body ?? ""}
                                rows={6}
                                required
                                className="textarea"
                            />
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="btn btn-primary btn-sm"
                                disabled={pending}
                            >
                                {t("common.save")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setEditingNote(null)}
                            >
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                )}

                {notes.length === 0 && !editingNote && (
                    <p className="text-base-content/60 text-sm">{t("library.noNotes")}</p>
                )}

                {notes.map((note) => (
                    <article key={note.id} className="card card-border bg-base-100">
                        <div className="card-body gap-2 p-4">
                            <div className="flex items-start justify-between gap-2">
                                {note.title ? (
                                    <h4 className="font-medium">{note.title}</h4>
                                ) : (
                                    <span />
                                )}
                                {canEdit && (
                                    <div className="flex shrink-0 gap-1">
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs btn-square"
                                            aria-label={t("common.edit")}
                                            disabled={pending || editingNote !== null}
                                            onClick={() => setEditingNote({ id: note.id })}
                                        >
                                            <Pencil className="size-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs btn-square text-error"
                                            aria-label={t("common.remove")}
                                            disabled={pending || editingNote !== null}
                                            onClick={() =>
                                                setRemoval({ kind: "note", id: note.id })
                                            }
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <p className="whitespace-pre-line text-sm">{note.body}</p>
                        </div>
                    </article>
                ))}
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{t("library.citations")}</h3>
                    {canEdit && !addingCitation && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={sources.length === 0}
                            onClick={() => setAddingCitation(true)}
                        >
                            <Plus className="size-4" />
                            {t("library.addCitation")}
                        </button>
                    )}
                </div>

                {canEdit && sources.length === 0 && (
                    <p className="text-base-content/60 text-xs">{t("library.noSources")}</p>
                )}

                {addingCitation && (
                    <form
                        onSubmit={onSaveCitation}
                        className="card card-border grid gap-3 bg-base-100 p-4"
                    >
                        <label className="flex flex-col gap-1">
                            <span className="text-xs">{t("library.chooseSource")}</span>
                            <select name="sourceId" required className="select">
                                {sources.map((source) => (
                                    <option key={source.id} value={source.id}>
                                        {source.title}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs">{t("library.citationPage")}</span>
                            <input name="page" className="input" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs">{t("library.citationText")}</span>
                            <textarea name="textExcerpt" rows={2} className="textarea" />
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="btn btn-primary btn-sm"
                                disabled={pending}
                            >
                                {t("common.save")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setAddingCitation(false)}
                            >
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                )}

                {citations.length === 0 && !addingCitation && (
                    <p className="text-base-content/60 text-sm">{t("library.noCitations")}</p>
                )}

                {citations.length > 0 && (
                    <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                        {citations.map((citation) => (
                            <li
                                key={citation.id}
                                className="flex items-start justify-between gap-3 px-4 py-3"
                            >
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <span className="font-medium text-sm">
                                        {citation.sourceTitle}
                                        {citation.page ? ` · ${citation.page}` : ""}
                                    </span>
                                    {citation.textExcerpt && (
                                        <span className="whitespace-pre-line text-base-content/70 text-xs">
                                            {citation.textExcerpt}
                                        </span>
                                    )}
                                </div>
                                {canEdit && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-xs btn-square text-error"
                                        aria-label={t("common.remove")}
                                        disabled={pending}
                                        onClick={() =>
                                            setRemoval({ kind: "citation", id: citation.id })
                                        }
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={removal !== null}
                title={
                    removal?.kind === "note"
                        ? t("library.removeNoteTitle")
                        : t("library.removeCitationTitle")
                }
                message={
                    removal?.kind === "note"
                        ? t("library.removeNoteConfirm")
                        : t("library.removeCitationConfirm")
                }
                confirmLabel={t("common.remove")}
                danger
                onConfirm={confirmRemoval}
                onCancel={() => setRemoval(null)}
            />
        </div>
    );
}
