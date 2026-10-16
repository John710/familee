"use client";

/**
 * Familee - the unions of a person: the partners, the children and the events of each.
 *
 * The lists come from the server; the forms call the union actions and refresh the
 * page on success. Nothing here decides a rule: the database checks have the
 * last word and their messages are shown as they are translated. The events of a
 * union (the marriage, the divorce) are edited with the same form a person's own
 * events use (components/persons/event-form.tsx).
 */

import { CalendarPlus, Heart, Pencil, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { type EventCitationRow, EventCitations } from "@/components/persons/event-citations";
import {
    EventForm,
    type EventFormRow,
    type EventTypeOption,
    type PlaceOption,
} from "@/components/persons/event-form";
import { useRouter } from "@/i18n/navigation";
import { deleteFamilyEventAction, saveFamilyEventAction } from "@/lib/actions/family-events";
import { addChildAction, createUnionAction } from "@/lib/actions/unions";

type UnionType = "marriage" | "partnership" | "civil_union" | "single_parent" | "unknown";
type Relation =
    | "biological"
    | "adopted"
    | "step"
    | "foster"
    | "guardianship"
    | "sealing"
    | "unknown";

/** One event of a union, as the panel reads and writes it. */
export type UnionEvent = EventFormRow & { citations: EventCitationRow[] };

export type UnionItem = {
    familyId: string;
    type: string;
    partner: { personId: string; name: string } | null;
    children: { personId: string; name: string; relation: string }[];
    events: UnionEvent[];
};

export type PersonOption = { personId: string; name: string };

const UNION_TYPES = ["marriage", "partnership", "civil_union", "single_parent", "unknown"] as const;
const RELATIONS = [
    "biological",
    "adopted",
    "step",
    "foster",
    "guardianship",
    "sealing",
    "unknown",
] as const;

/** The union whose event is being written, and which event: null means a new one. */
type EditingEvent = { familyId: string; eventId: string | null };

export function FamilyPanel({
    slug,
    personId,
    unions,
    options,
    eventTypes,
    places,
    sources,
    canEdit,
}: {
    slug: string;
    personId: string;
    unions: UnionItem[];
    /** Everybody in the tree except this person. */
    options: PersonOption[];
    /** The event types a union can have, and the places and sources to choose from. */
    eventTypes: EventTypeOption[];
    places: PlaceOption[];
    sources: { id: string; title: string }[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [editing, setEditing] = useState<EditingEvent | null>(null);
    /** The event waiting for the confirmation dialog, if any. */
    const [removing, setRemoving] = useState<{ familyId: string; eventId: string } | null>(null);

    const hasValueOf = (code: string) => eventTypes.find((type) => type.code === code)?.hasValue;

    function onAddUnion(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const partnerId = String(form.get("partner") ?? "");
        const type = String(form.get("type") ?? "marriage");

        setError(null);
        startTransition(async () => {
            const result = await createUnionAction({
                slug,
                personId,
                partnerId: partnerId === "" ? null : partnerId,
                type,
            });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            formElement.reset();
            router.refresh();
        });
    }

    function onAddChild(event: FormEvent<HTMLFormElement>, familyId: string) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const childId = String(form.get("child") ?? "");
        const relation = String(form.get("relation") ?? "biological");
        if (childId === "") return;

        setError(null);
        startTransition(async () => {
            const result = await addChildAction({ slug, familyId, childId, relation });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            formElement.reset();
            router.refresh();
        });
    }

    function onSaveEvent(
        event: FormEvent<HTMLFormElement>,
        familyId: string,
        eventId: string | null,
    ) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
            const result = await saveFamilyEventAction({
                slug,
                familyId,
                eventId,
                typeCode: String(form.get("typeCode") ?? ""),
                value: String(form.get("value") ?? ""),
                description: String(form.get("description") ?? ""),
                date: String(form.get("date") ?? ""),
                placeId: String(form.get("placeId") ?? "") || null,
            });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            setEditing(null);
            router.refresh();
        });
    }

    function onRemoveEvent(familyId: string, eventId: string) {
        setError(null);
        setRemoving(null);
        startTransition(async () => {
            const result = await deleteFamilyEventAction({ slug, familyId, eventId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-6">
            {unions.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("family.none")}</p>
            ) : (
                <ul className="flex flex-col gap-4">
                    {unions.map((union) => {
                        const writing = editing?.familyId === union.familyId ? editing : null;
                        const adding = writing !== null && writing.eventId === null;

                        return (
                            <li
                                key={union.familyId}
                                className="rounded-box border border-base-300 p-4"
                            >
                                <div className="flex items-center gap-2 font-medium">
                                    <Heart className="size-4 text-primary" />
                                    <span>
                                        {union.partner ? union.partner.name : t("family.noPartner")}
                                    </span>
                                    <span className="text-base-content/60 text-xs">
                                        · {t(`enums.family_type.${union.type as UnionType}`)}
                                    </span>
                                </div>

                                {/* The events of the union itself: the marriage, the divorce. They are
                                    what the tree and the timeline show beside the two names. */}
                                <div className="mt-3 flex flex-col gap-2">
                                    <span className="text-base-content/60 text-xs">
                                        {t("family.events")}
                                    </span>
                                    <ul className="flex flex-col gap-2">
                                        {union.events.length === 0 && !adding && (
                                            <li className="text-base-content/60 text-sm">
                                                {t("family.noEvents")}
                                            </li>
                                        )}
                                        {union.events.map((unionEvent) =>
                                            writing?.eventId === unionEvent.id ? (
                                                <li key={unionEvent.id}>
                                                    <EventForm
                                                        event={unionEvent}
                                                        types={eventTypes}
                                                        places={places}
                                                        hasValueOf={hasValueOf}
                                                        pending={pending}
                                                        onSubmit={(formEvent) =>
                                                            onSaveEvent(
                                                                formEvent,
                                                                union.familyId,
                                                                unionEvent.id,
                                                            )
                                                        }
                                                        onCancel={() => setEditing(null)}
                                                    />
                                                </li>
                                            ) : (
                                                <li
                                                    key={unionEvent.id}
                                                    className="flex flex-col gap-1 rounded-box bg-base-200/50 p-2"
                                                >
                                                    <div className="flex items-start justify-between gap-2 text-sm">
                                                        <span className="flex min-w-0 flex-col">
                                                            <span className="font-medium">
                                                                {t(
                                                                    `events.${unionEvent.typeCode}` as "events.birth",
                                                                )}
                                                                {unionEvent.value
                                                                    ? ` · ${unionEvent.value}`
                                                                    : ""}
                                                            </span>
                                                            {(unionEvent.dateOriginal ||
                                                                unionEvent.placeName) && (
                                                                <span className="text-base-content/60 text-xs">
                                                                    {[
                                                                        unionEvent.dateOriginal,
                                                                        unionEvent.placeName,
                                                                    ]
                                                                        .filter(Boolean)
                                                                        .join(" · ")}
                                                                </span>
                                                            )}
                                                            {unionEvent.description && (
                                                                <span className="whitespace-pre-line text-xs">
                                                                    {unionEvent.description}
                                                                </span>
                                                            )}
                                                        </span>
                                                        {canEdit && (
                                                            <span className="flex shrink-0 gap-1">
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-xs btn-square"
                                                                    aria-label={t("common.edit")}
                                                                    disabled={pending}
                                                                    onClick={() =>
                                                                        setEditing({
                                                                            familyId:
                                                                                union.familyId,
                                                                            eventId: unionEvent.id,
                                                                        })
                                                                    }
                                                                >
                                                                    <Pencil className="size-3.5" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-xs btn-square text-error"
                                                                    aria-label={t("common.remove")}
                                                                    disabled={pending}
                                                                    onClick={() =>
                                                                        setRemoving({
                                                                            familyId:
                                                                                union.familyId,
                                                                            eventId: unionEvent.id,
                                                                        })
                                                                    }
                                                                >
                                                                    <Trash2 className="size-3.5" />
                                                                </button>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <EventCitations
                                                        slug={slug}
                                                        owner={{ familyId: union.familyId }}
                                                        eventId={unionEvent.id}
                                                        citations={unionEvent.citations}
                                                        sources={sources}
                                                        canEdit={canEdit}
                                                    />
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                    {canEdit && adding && (
                                        <EventForm
                                            event={null}
                                            types={eventTypes}
                                            places={places}
                                            hasValueOf={hasValueOf}
                                            pending={pending}
                                            onSubmit={(formEvent) =>
                                                onSaveEvent(formEvent, union.familyId, null)
                                            }
                                            onCancel={() => setEditing(null)}
                                        />
                                    )}
                                    {canEdit && !adding && (
                                        <div>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                disabled={pending}
                                                onClick={() =>
                                                    setEditing({
                                                        familyId: union.familyId,
                                                        eventId: null,
                                                    })
                                                }
                                            >
                                                <CalendarPlus className="size-4" />
                                                {t("family.addEvent")}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <ul className="mt-3 flex flex-col gap-1 text-sm">
                                    {union.children.length === 0 ? (
                                        <li className="text-base-content/60">
                                            {t("family.noChildren")}
                                        </li>
                                    ) : (
                                        union.children.map((child) => (
                                            <li
                                                key={child.personId}
                                                className="flex items-center gap-2"
                                            >
                                                <span>{child.name}</span>
                                                <span className="text-base-content/60 text-xs">
                                                    {t(
                                                        `enums.child_relation.${child.relation as Relation}`,
                                                    )}
                                                </span>
                                            </li>
                                        ))
                                    )}
                                </ul>

                                <form
                                    onSubmit={(event) => onAddChild(event, union.familyId)}
                                    className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
                                >
                                    <select name="child" className="select w-full" defaultValue="">
                                        <option value="" disabled>
                                            {t("family.chooseChild")}
                                        </option>
                                        {options.map((option) => (
                                            <option key={option.personId} value={option.personId}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        name="relation"
                                        defaultValue="biological"
                                        className="select w-full"
                                    >
                                        {RELATIONS.map((relation) => (
                                            <option key={relation} value={relation}>
                                                {t(`enums.child_relation.${relation}`)}
                                            </option>
                                        ))}
                                    </select>
                                    <button type="submit" className="btn btn-sm" disabled={pending}>
                                        <UserPlus className="size-4" />
                                        {t("family.addChild")}
                                    </button>
                                </form>
                            </li>
                        );
                    })}
                </ul>
            )}

            <form onSubmit={onAddUnion} className="card card-border bg-base-100">
                <div className="card-body gap-3">
                    <h3 className="font-semibold">{t("family.add")}</h3>
                    <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                        <select name="partner" defaultValue="" className="select w-full">
                            <option value="">{t("family.noPartner")}</option>
                            {options.map((option) => (
                                <option key={option.personId} value={option.personId}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                        <select name="type" defaultValue="marriage" className="select w-full">
                            {UNION_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {t(`enums.family_type.${type}`)}
                                </option>
                            ))}
                        </select>
                        <button type="submit" className="btn btn-primary" disabled={pending}>
                            {t("family.addPartner")}
                        </button>
                    </div>
                    {error && (
                        <p role="alert" className="text-error text-sm">
                            {error}
                        </p>
                    )}
                </div>
            </form>

            <ConfirmDialog
                open={removing !== null}
                title={t("family.removeEventTitle")}
                message={t("family.removeEventConfirm")}
                confirmLabel={t("common.remove")}
                danger
                onConfirm={() => {
                    if (removing) onRemoveEvent(removing.familyId, removing.eventId);
                }}
                onCancel={() => setRemoving(null)}
            />
        </div>
    );
}
