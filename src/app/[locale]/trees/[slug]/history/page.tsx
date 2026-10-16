import { and, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { PhotoThumb } from "@/components/media/photo-thumb";
import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/** The translation key of each field the log can name. */
const FIELD_LABELS: Record<string, string> = {
    surname: "person.fields.surname",
    given: "person.fields.given",
    patronymic: "person.fields.patronymic",
    nickname: "person.fields.nickname",
    sex: "person.fields.sex",
    birth: "person.fields.birth",
    death: "person.fields.death",
    notes: "person.fields.notes",
    type: "person.fields.nameType",
    typeCode: "person.fields.eventType",
    value: "person.fields.eventValue",
    description: "person.fields.notes",
    date: "person.fields.date",
    photo: "history.labels.photo",
    main: "history.labels.main",
    crop: "history.labels.crop",
    file: "history.labels.file",
    unionType: "family.fields.type",
    partner: "family.partners",
    child: "family.children",
    childRelation: "family.fields.childRelation",
    memberRole: "members.role",
    logo: "history.labels.logo",
};

type Change = { from: unknown; to: unknown };

export default async function HistoryPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/history`);
    const access = await getTreeAccess(slug, user.id);
    // The history is for the owner and the administrators; everybody else gets a 404.
    if (!access || !atLeast(access.role, "admin")) notFound();

    const rows = await db
        .select({
            id: schema.auditLog.id,
            action: schema.auditLog.action,
            entityType: schema.auditLog.entityType,
            entityId: schema.auditLog.entityId,
            changes: schema.auditLog.changes,
            createdAt: schema.auditLog.createdAt,
            userName: schema.users.name,
            userEmail: schema.users.email,
        })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
        .where(eq(schema.auditLog.treeId, access.treeId))
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(200);

    // The people, names and events the entries are about, found by their ids.
    const personIds = new Set<string>();
    const nameIds = new Set<string>();
    const eventIds = new Set<string>();
    const mediaIds = new Set<string>();
    for (const row of rows) {
        if (row.entityId) {
            if (row.entityType === "person" || row.entityType === "person_photo") {
                personIds.add(row.entityId);
            } else if (row.entityType === "person_name") {
                nameIds.add(row.entityId);
            } else if (row.entityType === "event" || row.entityType === "event_photo") {
                eventIds.add(row.entityId);
            } else if (row.entityType === "media") {
                mediaIds.add(row.entityId);
            }
        }
        for (const [field, change] of Object.entries(row.changes ?? {})) {
            if (field !== "photo" && field !== "main") continue;
            for (const value of [change.from, change.to]) {
                if (typeof value === "string") mediaIds.add(value);
            }
        }
    }

    const personNames = new Map<string, string>();
    if (personIds.size + nameIds.size + eventIds.size > 0) {
        const cards = await db
            .select({ personId: schema.personCards.personId, name: schema.personCards.fullName })
            .from(schema.personCards)
            .where(eq(schema.personCards.treeId, access.treeId));
        for (const card of cards) personNames.set(card.personId, card.name ?? "");
    }
    const personOfName = new Map<string, string>();
    if (nameIds.size > 0) {
        const names = await db
            .select({ id: schema.personNames.id, personId: schema.personNames.personId })
            .from(schema.personNames)
            .where(inArray(schema.personNames.id, [...nameIds]));
        for (const name of names) personOfName.set(name.id, name.personId);
    }
    const personOfEvent = new Map<string, { personId: string | null; typeCode: string }>();
    if (eventIds.size > 0) {
        const events = await db
            .select({
                id: schema.events.id,
                personId: schema.events.personId,
                typeCode: schema.events.typeCode,
            })
            .from(schema.events)
            .where(
                and(
                    inArray(schema.events.id, [...eventIds]),
                    eq(schema.events.treeId, access.treeId),
                ),
            );
        for (const event of events) {
            personOfEvent.set(event.id, { personId: event.personId, typeCode: event.typeCode });
        }
    }

    // A photograph is shown while it still exists; a removed one is named by its file.
    const mediaName = new Map<string, string | null>();
    if (mediaIds.size > 0) {
        const media = await db
            .select({ id: schema.media.id, name: schema.media.originalFilename })
            .from(schema.media)
            .where(
                and(
                    inArray(schema.media.id, [...mediaIds]),
                    eq(schema.media.treeId, access.treeId),
                ),
            );
        for (const row of media) mediaName.set(row.id, row.name);
    }

    const t = await getTranslations();
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

    /** The person an entry is about (its name), when it can still be found. */
    const personOf = (row: (typeof rows)[number]): string | null => {
        const id = row.entityId;
        if (!id) return null;
        let personId: string | null = null;
        if (row.entityType === "person" || row.entityType === "person_photo") personId = id;
        if (row.entityType === "person_name") personId = personOfName.get(id) ?? null;
        if (row.entityType === "event" || row.entityType === "event_photo") {
            personId = personOfEvent.get(id)?.personId ?? null;
        }
        if (!personId) return null;
        return personNames.get(personId) || t("common.unknown");
    };

    /** One value of a change, shown in the way that suits its field. */
    const renderValue = (field: string, value: unknown): ReactNode => {
        if (value === null || value === undefined || value === "") {
            return <span className="text-base-content/50">{t("common.none")}</span>;
        }
        if (field === "sex") return t(`enums.sex.${value as "male" | "female" | "unknown"}`);
        if (field === "type") {
            return t(`enums.name_type.${value as "birth"}` as "enums.name_type.birth");
        }
        if (field === "typeCode") return t(`events.${value as "birth"}` as "events.birth");
        if (field === "unionType") return t(`enums.family_type.${value as "marriage"}`);
        if (field === "childRelation") return t(`enums.child_relation.${value as "biological"}`);
        if (field === "memberRole") return t(`enums.member_role.${value as "editor"}`);
        // The logo itself is never logged; the field says only that the tree has one now.
        if (field === "logo") return t("history.labels.logoSet");
        return String(value);
    };

    /** A photograph named in a change: its thumbnail and file name, or the word for a removed one. */
    const renderPhoto = (value: unknown, fallbackName: string | null, slugValue: string) => {
        if (value === null || value === undefined || value === "") {
            return <span className="text-base-content/50">{t("common.none")}</span>;
        }
        const id = String(value);
        if (!mediaName.has(id)) {
            return (
                <span className="text-base-content/60">
                    {t("history.photoGone")}
                    {fallbackName ? `: ${fallbackName}` : ""}
                </span>
            );
        }
        const name = mediaName.get(id) || fallbackName || t("history.labels.photo");
        return (
            <span className="inline-flex items-center gap-2">
                <PhotoThumb slug={slugValue} mediaId={id} label={name} />
                <span>{name}</span>
            </span>
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("history.title")}</h1>
                <p className="text-base-content/60 text-sm">{t("history.hint")}</p>
            </header>

            {rows.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("history.empty")}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                    {rows.map((row) => {
                        const who = row.userName || row.userEmail || t("history.byUnknown");
                        const about = personOf(row);
                        const changes = row.changes ? Object.entries(row.changes) : [];
                        const fileName =
                            (row.changes?.file?.to as string | null | undefined) ??
                            (row.changes?.file?.from as string | null | undefined) ??
                            null;
                        const eventType =
                            row.entityType === "event" || row.entityType === "event_photo"
                                ? personOfEvent.get(row.entityId ?? "")?.typeCode
                                : undefined;
                        const ownPhoto =
                            row.entityType === "media" &&
                            row.entityId &&
                            mediaName.has(row.entityId)
                                ? row.entityId
                                : null;
                        return (
                            <li key={row.id}>
                                <details className="group px-4 py-3">
                                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                                        <span className="font-medium">{who}</span>
                                        <span className="text-base-content/70">
                                            {t(
                                                `history.actions.${row.action}` as "history.actions.create",
                                            )}{" "}
                                            {t(
                                                `history.entities.${row.entityType}` as "history.entities.person",
                                            )}
                                            {eventType && (
                                                <> {t(`events.${eventType}` as "events.birth")}</>
                                            )}
                                            {about && <> · {about}</>}
                                            {fileName && <> · {fileName}</>}
                                        </span>
                                        <span className="text-base-content/50 text-xs">
                                            {dateFormat.format(row.createdAt)}
                                        </span>
                                        <span className="text-base-content/40 text-xs group-open:hidden">
                                            {t("history.showDetails")}
                                        </span>
                                        <span className="hidden text-base-content/40 text-xs group-open:inline">
                                            {t("history.hideDetails")}
                                        </span>
                                    </summary>

                                    <div className="mt-3 flex flex-col gap-3 pl-2">
                                        {ownPhoto && row.entityId && (
                                            <PhotoThumb
                                                slug={slug}
                                                mediaId={row.entityId}
                                                label={mediaName.get(row.entityId) || ""}
                                                size="size-24"
                                            />
                                        )}
                                        {changes.length === 0 ? (
                                            <p className="text-base-content/60 text-xs">
                                                {t("history.noDetails")}
                                            </p>
                                        ) : (
                                            <dl className="grid gap-2 text-xs sm:grid-cols-[auto_1fr]">
                                                {changes.map(
                                                    ([field, change]: [string, Change]) => (
                                                        <div key={field} className="contents">
                                                            <dt className="font-medium text-base-content/80">
                                                                {FIELD_LABELS[field]
                                                                    ? t(
                                                                          FIELD_LABELS[
                                                                              field
                                                                          ] as "person.fields.surname",
                                                                      )
                                                                    : field}
                                                            </dt>
                                                            <dd className="flex flex-wrap items-center gap-2">
                                                                {change.from !== null &&
                                                                    change.from !== undefined && (
                                                                        <>
                                                                            <span className="text-base-content/60 line-through">
                                                                                {field ===
                                                                                    "photo" ||
                                                                                field === "main"
                                                                                    ? renderPhoto(
                                                                                          change.from,
                                                                                          fileName,
                                                                                          slug,
                                                                                      )
                                                                                    : renderValue(
                                                                                          field,
                                                                                          change.from,
                                                                                      )}
                                                                            </span>
                                                                            <span aria-hidden="true">
                                                                                →
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                <span>
                                                                    {field === "photo" ||
                                                                    field === "main"
                                                                        ? renderPhoto(
                                                                              change.to,
                                                                              fileName,
                                                                              slug,
                                                                          )
                                                                        : renderValue(
                                                                              field,
                                                                              change.to,
                                                                          )}
                                                                </span>
                                                            </dd>
                                                        </div>
                                                    ),
                                                )}
                                            </dl>
                                        )}
                                    </div>
                                </details>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
