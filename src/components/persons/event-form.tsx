"use client";

/**
 * Familee - the form of one event, shared by a person and by a union
 *
 * A person's occupation, baptism or residence and a union's marriage or divorce are the same row of
 * familee.events, read and written the same way; only the list they belong to differs. This is the
 * one form both panels use, so the fields, the labels and the date the reader types stay identical.
 */

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

export type EventTypeOption = { code: string; hasValue: boolean };

export type PlaceOption = { id: string; name: string };

/** The fields of an event the form reads and writes; a citation or a photograph is added on top. */
export type EventFormRow = {
    id: string;
    typeCode: string;
    value: string | null;
    description: string | null;
    /** The date as it was written (\"12 April 1921\"), so a reader corrects what they see. */
    dateOriginal: string | null;
    placeId: string | null;
    placeName: string | null;
};

export function EventForm({
    event,
    types,
    places,
    hasValueOf,
    pending,
    onSubmit,
    onCancel,
}: {
    event: EventFormRow | null;
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
