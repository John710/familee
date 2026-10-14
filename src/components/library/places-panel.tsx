"use client";

/**
 * Familee - the places of the archive: a village is part of a district, a district of a region.
 *
 * Everybody sees the list; editors add, change and remove. Removal asks in the archive's dialog.
 * The server checks every write again.
 */

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { deletePlaceAction, type PlaceInput, savePlaceAction } from "@/lib/actions/library";

export type PlaceRow = {
    id: string;
    name: string;
    kind: string;
    parentId: string | null;
    fullName: string | null;
    notes: string | null;
};

const KINDS = [
    "country",
    "region",
    "oblast",
    "krai",
    "republic",
    "district",
    "city",
    "town",
    "village",
    "settlement",
    "street",
    "building",
    "cemetery",
    "church",
    "hospital",
    "other",
] as const;

export function PlacesPanel({
    slug,
    places,
    canEdit,
}: {
    slug: string;
    places: PlaceRow[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [editing, setEditing] = useState<{ id: string | null } | null>(null);
    const [removing, setRemoving] = useState<PlaceRow | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const byId = new Map(places.map((place) => [place.id, place]));

    function onSave(event: FormEvent<HTMLFormElement>, id: string | null) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const input: PlaceInput = {
            slug,
            id,
            name: String(form.get("name") ?? ""),
            kind: String(form.get("kind") ?? "other"),
            parentId: String(form.get("parentId") ?? "") || null,
            fullName: String(form.get("fullName") ?? ""),
            notes: String(form.get("notes") ?? ""),
        };
        setError(null);
        startTransition(async () => {
            const result = await savePlaceAction(input);
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
            const result = await deletePlaceAction({ slug, id: target.id });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-5">
            {canEdit && editing === null && (
                <button
                    type="button"
                    className="btn btn-primary btn-sm w-fit"
                    onClick={() => setEditing({ id: null })}
                >
                    <Plus className="size-4" />
                    {t("place.add")}
                </button>
            )}

            {editing && (
                <PlaceForm
                    place={editing.id ? (byId.get(editing.id) ?? null) : null}
                    places={places}
                    pending={pending}
                    onSubmit={(event) => onSave(event, editing.id)}
                    onCancel={() => setEditing(null)}
                />
            )}

            {places.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("place.empty")}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                    {places.map((place) => {
                        const parent = place.parentId ? byId.get(place.parentId) : null;
                        return (
                            <li
                                key={place.id}
                                className="flex items-start justify-between gap-3 px-4 py-3"
                            >
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <span className="font-medium text-sm">{place.name}</span>
                                    <span className="text-base-content/60 text-xs">
                                        {t(
                                            `enums.place_kind.${place.kind}` as "enums.place_kind.city",
                                        )}
                                        {parent
                                            ? ` · ${t("place.fields.parent")}: ${parent.name}`
                                            : ""}
                                        {place.fullName ? ` · ${place.fullName}` : ""}
                                    </span>
                                    {place.notes && (
                                        <span className="whitespace-pre-line text-xs">
                                            {place.notes}
                                        </span>
                                    )}
                                </div>
                                {canEdit && (
                                    <div className="flex shrink-0 gap-1">
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs btn-square"
                                            aria-label={t("place.edit")}
                                            disabled={pending || editing !== null}
                                            onClick={() => setEditing({ id: place.id })}
                                        >
                                            <Pencil className="size-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs btn-square text-error"
                                            aria-label={t("common.remove")}
                                            disabled={pending || editing !== null}
                                            onClick={() => setRemoving(place)}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={removing !== null}
                title={t("place.removeTitle")}
                message={t("place.removeConfirm")}
                confirmLabel={t("common.remove")}
                danger
                onConfirm={confirmRemoval}
                onCancel={() => setRemoving(null)}
            />
        </div>
    );
}

function PlaceForm({
    place,
    places,
    pending,
    onSubmit,
    onCancel,
}: {
    place: PlaceRow | null;
    places: PlaceRow[];
    pending: boolean;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
}) {
    const t = useTranslations();
    return (
        <form
            onSubmit={onSubmit}
            className="card card-border grid gap-3 bg-base-100 p-4 sm:grid-cols-2"
        >
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("place.fields.name")}</span>
                <input name="name" defaultValue={place?.name ?? ""} required className="input" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("place.fields.kind")}</span>
                <select name="kind" defaultValue={place?.kind ?? "other"} className="select">
                    {KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                            {t(`enums.place_kind.${kind}` as "enums.place_kind.city")}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("place.fields.parent")}</span>
                <select name="parentId" defaultValue={place?.parentId ?? ""} className="select">
                    <option value="">—</option>
                    {places
                        .filter((candidate) => candidate.id !== place?.id)
                        .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                                {candidate.name}
                            </option>
                        ))}
                </select>
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("place.fields.fullName")}</span>
                <input name="fullName" defaultValue={place?.fullName ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs">{t("place.fields.notes")}</span>
                <textarea
                    name="notes"
                    defaultValue={place?.notes ?? ""}
                    rows={2}
                    className="textarea"
                />
            </label>
            <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
                    {t("common.save")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
                    {t("common.cancel")}
                </button>
            </div>
        </form>
    );
}
