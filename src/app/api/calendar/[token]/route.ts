/**
 * Familee - the calendar of a tree, as an iCalendar feed
 *
 * A calendar app on a phone has no session, so the address carries the tree's own token (it lives
 * in familee.trees.calendar_token). An unknown token gets the same answer as a tree that does not
 * exist: nothing about the archive is said to somebody who does not have the key.
 *
 * Birthdays and wedding days become yearly events. Only dates with a full day go in: a birthday
 * known to the month would be pinned to a day nobody recorded.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { db, schema } from "@/db";
import { routing } from "@/i18n/routing";
import { buildCalendarFeed, type CalendarEntry } from "@/lib/calendar";
import { listPersonCards } from "@/lib/people";
import { loadFamilies } from "@/lib/tree-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The event type that marks a wedding in the catalogue (db/migrations/0002_reference_data.sql). */
const MARRIAGE = "marriage";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!UUID.test(token)) return new Response("Not found", { status: 404 });

    const [tree] = await db
        .select({
            id: schema.trees.id,
            title: schema.trees.title,
            defaultLocale: schema.trees.defaultLocale,
        })
        .from(schema.trees)
        .where(eq(schema.trees.calendarToken, token))
        .limit(1);
    if (!tree) return new Response("Not found", { status: 404 });

    const locale = routing.locales.includes(tree.defaultLocale)
        ? tree.defaultLocale
        : routing.defaultLocale;
    const t = await getTranslations({ locale });

    const cards = await listPersonCards(tree.id);
    const nameOf = new Map(cards.map((card) => [card.personId, card.fullName ?? ""]));

    const entries: CalendarEntry[] = [];
    for (const card of cards) {
        if (!card.birthDate || card.birthPrecision !== "day") continue;
        entries.push({
            uid: `birth-${card.personId}@familee`,
            date: card.birthDate,
            summary: t("calendar.birthday", { name: card.fullName ?? "" }),
        });
    }

    const weddings = await db
        .select({
            id: schema.events.id,
            familyId: schema.events.familyId,
            date: schema.events.sortDate,
        })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.treeId, tree.id),
                eq(schema.events.typeCode, MARRIAGE),
                eq(schema.events.datePrecision, "day"),
                isNotNull(schema.events.familyId),
            ),
        );

    const partnersOf = new Map(
        (await loadFamilies(tree.id)).map((family) => [family.id, family.partners]),
    );

    for (const wedding of weddings) {
        if (!wedding.familyId || !wedding.date) continue;
        const names = (partnersOf.get(wedding.familyId) ?? [])
            .map((personId) => nameOf.get(personId) ?? "")
            .filter(Boolean)
            .join(" & ");
        if (!names) continue;

        entries.push({
            uid: `wedding-${wedding.id}@familee`,
            date: wedding.date,
            summary: t("calendar.wedding", { names }),
        });
    }

    return new Response(buildCalendarFeed({ title: tree.title, entries, stamp: new Date() }), {
        headers: {
            "Cache-Control": "private, max-age=3600",
            "Content-Disposition": 'inline; filename="familee.ics"',
            "Content-Type": "text/calendar; charset=utf-8",
        },
    });
}
