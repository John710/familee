"use client";

/**
 * Familee - the additional names and the other events of a person.
 *
 * One form serves both: a name or an event is added or edited inline, and the removal asks in
 * the archive's own dialog. Everybody sees the lists; editors change them. The server checks
 * every write again and writes the audit log entry.
 */

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { EventCitations } from "@/components/persons/event-citations";
import { EventPhotos } from "@/components/persons/event-photos";
import { useRouter } from "@/i18n/navigation";
import {
    deleteEventAction,
    deleteNameAction,
    type EventInput,
    saveEventAction,
    saveNameAction,
} from "@/lib/actions/records";

export type AdditionalName = {
    id: string;
    type: string;
    surname: string | null;
    given: string | null;
    patronymic: string | null;
    nickname: string | null;
};

export type OtherEvent = {
    id: string;
    typeCode: string;
    value: string | null;
    description: string | null;
    dateOriginal: string | null;
    placeId: string | null;
    placeName: string | null;
    citations: {
        id: string;
        sourceTitle: string;
        page: string | null;
        textExcerpt: string | null;
    }[];
    photos: { mediaId: string }[];
};

export type EventTypeOption = { code: string; hasValue: boolean };

export type PlaceOption = { id: string; name: string };

const NAME_TYPES = [
    "married",
    "maiden",
    "also_known_as",
    "nickname",
    "religious",
    "immigrant",
    "legal",
    "birth",
] as const;

type Editing = { kind: "name"; id: string | null } | { kind: "event"; id: string | null } | null;

export function RecordsPanel({
    slug,
    personId,
    names,
    events,
    eventTypes,
    places,
    sources,
    canEdit,
}: {
    slug: string;
    personId: string;
    names: AdditionalName[];
    events: OtherEvent[];
    eventTypes: EventTypeOption[];
    places: PlaceOption[];
    sources: { id: string; title: string }[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [editing, setEditing] = useState<Editing>(null);
    const [askingRemoval, setAskingRemoval] = useState<{
        kind: "name" | "event";
        id: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const translate = (key: string) => t(key as Parameters<typeof t>[0]);

    function finish(result: { ok: true } | { ok: false; error: string }) {
        if (!result.ok) {
            setError(translate(result.error));
            return false;
        }
        setEditing(null);
        setError(null);
        router.refresh();
        return true;
    }

    function onSaveName(event: FormEvent<HTMLFormElement>, id: string | null) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
            finish(
                await saveNameAction({
                    slug,
                    personId,
                    nameId: id,
                    type: String(form.get("type") ?? "also_known_as"),
                    surname: String(form.get("surname") ?? ""),
                    given: String(form.get("given") ?? ""),
                    patronymic: String(form.get("patronymic") ?? ""),
                    nickname: String(form.get("nickname") ?? ""),
                }),
            );
        });
    }

    function onSaveEvent(event: FormEvent<HTMLFormElement>, id: string | null) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const input: EventInput = {
            slug,
            personId,
            eventId: id,
            typeCode: String(form.get("typeCode") ?? ""),
            value: String(form.get("value") ?? ""),
            description: String(form.get("description") ?? ""),
            date: String(form.get("date") ?? ""),
            placeId: String(form.get("placeId") ?? "") || null,
        };
        setError(null);
        startTransition(async () => {
            finish(await saveEventAction(input));
        });
    }

    function confirmRemoval() {
        if (!askingRemoval) return;
        const target = askingRemoval;
        setAskingRemoval(null);
        setError(null);
        startTransition(async () => {
            finish(
                target.kind === "name"
                    ? await deleteNameAction({ slug, personId, nameId: target.id })
                    : await deleteEventAction({ slug, personId, eventId: target.id }),
            );
        });
    }

    const nameTypeOptions = NAME_TYPES;
    const hasValueOf = (code: string) => eventTypes.find((type) => type.code === code)?.hasValue;

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{t("person.additionalNames")}</h3>
                    {canEdit && editing?.kind !== "name" && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing({ kind: "name", id: null })}
                        >
                            <Plus className="size-4" />
                            {t("person.addName")}
                        </button>
                    )}
                </div>

                {names.length === 0 && editing?.kind !== "name" && (
                    <p className="text-base-content/60 text-sm">{t("person.noAdditionalNames")}</p>
                )}

                {names.length > 0 && (
                    <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300">
                        {names.map((name) => (
                            <li key={name.id} className="flex flex-col gap-2 px-4 py-3">
                                {editing?.kind === "name" && editing.id === name.id ? (
                                    <NameForm
                                        name={name}
                                        types={nameTypeOptions}
                                        pending={pending}
                                        onSubmit={(event) => onSaveName(event, name.id)}
                                        onCancel={() => setEditing(null)}
                                    />
                                ) : (
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-medium text-sm">
                                                {[name.surname, name.given, name.patronymic]
                                                    .filter(Boolean)
                                                    .join(" ") ||
                                                    name.nickname ||
                                                    t("common.unknown")}
                                            </span>
                                            <span className="text-base-content/60 text-xs">
                                                {translate(`enums.name_type.${name.type}`)}
                                            </span>
                                        </div>
                                        {canEdit && (
                                            <div className="flex shrink-0 gap-1">
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-xs btn-square"
                                                    aria-label={t("common.edit")}
                                                    disabled={pending || editing !== null}
                                                    onClick={() =>
                                                        setEditing({ kind: "name", id: name.id })
                                                    }
                                                >
                                                    <Pencil className="size-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-xs btn-square text-error"
                                                    aria-label={t("common.remove")}
                                                    disabled={pending || editing !== null}
                                                    onClick={() =>
                                                        setAskingRemoval({
                                                            kind: "name",
                                                            id: name.id,
                                                        })
                                                    }
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {editing?.kind === "name" && editing.id === null && (
                    <NameForm
                        name={null}
                        types={nameTypeOptions}
                        pending={pending}
                        onSubmit={(event) => onSaveName(event, null)}
                        onCancel={() => setEditing(null)}
                    />
                )}
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{t("person.otherEvents")}</h3>
                    {canEdit && editing?.kind !== "event" && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing({ kind: "event", id: null })}
                        >
                            <Plus className="size-4" />
                            {t("person.addEvent")}
                        </button>
                    )}
                </div>

                {events.length === 0 && editing?.kind !== "event" && (
                    <p className="text-base-content/60 text-sm">{t("person.noOtherEvents")}</p>
                )}

                {events.length > 0 && (
                    <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300">
                        {events.map((event) => (
                            <li key={event.id} className="flex flex-col gap-2 px-4 py-3">
                                {editing?.kind === "event" && editing.id === event.id ? (
                                    <EventForm
                                        event={event}
                                        types={eventTypes}
                                        places={places}
                                        hasValueOf={hasValueOf}
                                        pending={pending}
                                        onSubmit={(e) => onSaveEvent(e, event.id)}
                                        onCancel={() => setEditing(null)}
                                    />
                                ) : (
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 flex-col gap-0.5">
                                            <span className="font-medium text-sm">
                                                {translate(`events.${event.typeCode}`)}
                                                {event.value ? ` · ${event.value}` : ""}
                                            </span>
                                            {event.dateOriginal && (
                                                <span className="text-base-content/70 text-xs">
                                                    {event.dateOriginal}
                                                </span>
                                            )}
                                            {event.placeName && (
                                                <span className="text-base-content/70 text-xs">
                                                    {event.placeName}
                                                </span>
                                            )}
                                            {event.description && (
                                                <span className="whitespace-pre-line text-xs">
                                                    {event.description}
                                                </span>
                                            )}
                                            <EventPhotos
                                                slug={slug}
                                                eventId={event.id}
                                                photos={event.photos}
                                                canEdit={canEdit}
                                            />
                                            <EventCitations
                                                slug={slug}
                                                personId={personId}
                                                eventId={event.id}
                                                citations={event.citations}
                                                sources={sources}
                                                canEdit={canEdit}
                                            />
                                        </div>
                                        {canEdit && (
                                            <div className="flex shrink-0 gap-1">
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-xs btn-square"
                                                    aria-label={t("common.edit")}
                                                    disabled={pending || editing !== null}
                                                    onClick={() =>
                                                        setEditing({ kind: "event", id: event.id })
                                                    }
                                                >
                                                    <Pencil className="size-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-xs btn-square text-error"
                                                    aria-label={t("common.remove")}
                                                    disabled={pending || editing !== null}
                                                    onClick={() =>
                                                        setAskingRemoval({
                                                            kind: "event",
                                                            id: event.id,
                                                        })
                                                    }
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {editing?.kind === "event" && editing.id === null && (
                    <EventForm
                        event={null}
                        types={eventTypes}
                        places={places}
                        hasValueOf={hasValueOf}
                        pending={pending}
                        onSubmit={(e) => onSaveEvent(e, null)}
                        onCancel={() => setEditing(null)}
                    />
                )}
            </section>

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={askingRemoval !== null}
                title={
                    askingRemoval?.kind === "name"
                        ? t("person.removeNameTitle")
                        : t("person.removeEventTitle")
                }
                message={
                    askingRemoval?.kind === "name"
                        ? t("person.removeNameConfirm")
                        : t("person.removeEventConfirm")
                }
                confirmLabel={t("common.remove")}
                danger
                onConfirm={confirmRemoval}
                onCancel={() => setAskingRemoval(null)}
            />
        </div>
    );
}

function NameForm({
    name,
    types,
    pending,
    onSubmit,
    onCancel,
}: {
    name: AdditionalName | null;
    types: readonly string[];
    pending: boolean;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
}) {
    const t = useTranslations();
    return (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("person.fields.nameType")}</span>
                <select name="type" defaultValue={name?.type ?? "also_known_as"} className="select">
                    {types.map((type) => (
                        <option key={type} value={type}>
                            {t(`enums.name_type.${type}` as "enums.name_type.birth")}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("person.fields.surname")}</span>
                <input name="surname" defaultValue={name?.surname ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("person.fields.given")}</span>
                <input name="given" defaultValue={name?.given ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("person.fields.patronymic")}</span>
                <input name="patronymic" defaultValue={name?.patronymic ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs">{t("person.fields.nickname")}</span>
                <input name="nickname" defaultValue={name?.nickname ?? ""} className="input" />
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

function EventForm({
    event,
    types,
    places,
    hasValueOf,
    pending,
    onSubmit,
    onCancel,
}: {
    event: OtherEvent | null;
    types: EventTypeOption[];
    places: PlaceOption[];
    hasValueOf: (code: string) => boolean | undefined;
    pending: boolean;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
}) {
    const t = useTranslations();
    const [typeCode, setTypeCode] = useState(event?.typeCode ?? types[0]?.code ?? "");
    const showValue = hasValueOf(typeCode) === true;

    return (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("person.fields.eventType")}</span>
                <select
                    name="typeCode"
                    value={typeCode}
                    onChange={(e) => setTypeCode(e.target.value)}
                    className="select"
                >
                    {types.map((type) => (
                        <option key={type.code} value={type.code}>
                            {t(`events.${type.code}` as "events.birth")}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs">{t("person.fields.date")}</span>
                <input
                    name="date"
                    defaultValue={event?.dateOriginal ?? ""}
                    placeholder="1921-04-12"
                    className="input"
                />
            </label>
            {showValue && (
                <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs">{t("person.fields.eventValue")}</span>
                    <input name="value" defaultValue={event?.value ?? ""} className="input" />
                </label>
            )}
            {places.length > 0 && (
                <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs">{t("event.fields.place")}</span>
                    <select name="placeId" defaultValue={event?.placeId ?? ""} className="select">
                        <option value="">{t("common.none")}</option>
                        {places.map((place) => (
                            <option key={place.id} value={place.id}>
                                {place.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs">{t("person.fields.notes")}</span>
                <textarea
                    name="description"
                    defaultValue={event?.description ?? ""}
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
