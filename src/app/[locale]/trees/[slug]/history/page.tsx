import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/** The fields of a person that the log names, with their translation keys. */
const PERSON_FIELDS = {
    surname: "person.fields.surname",
    given: "person.fields.given",
    patronymic: "person.fields.patronymic",
    sex: "person.fields.sex",
    birth: "person.fields.birth",
    death: "person.fields.death",
    notes: "person.fields.notes",
} as const;

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

    const t = await getTranslations();
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

    const show = (field: string, value: unknown): string => {
        if (value === null || value === undefined || value === "") return t("common.none");
        if (field === "sex" && typeof value === "string") {
            return t(`enums.sex.${value as "male" | "female" | "unknown"}`);
        }
        return String(value);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("history.title")}</h1>
            </header>

            {rows.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("history.empty")}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                    {rows.map((row) => {
                        const who = row.userName || row.userEmail || t("history.byUnknown");
                        const changes = row.changes ? Object.entries(row.changes) : [];
                        return (
                            <li key={row.id} className="flex flex-col gap-2 px-4 py-3">
                                <p className="text-sm">
                                    <span className="font-medium">{who}</span>{" "}
                                    <span className="text-base-content/70">
                                        {t(
                                            `history.actions.${row.action}` as "history.actions.create",
                                        )}{" "}
                                        {t(
                                            `history.entities.${row.entityType}` as "history.entities.person",
                                        )}
                                    </span>
                                    <span className="text-base-content/50 text-xs">
                                        {" · "}
                                        {dateFormat.format(row.createdAt)}
                                    </span>
                                </p>
                                {changes.length > 0 && (
                                    <ul className="flex flex-col gap-1 text-xs">
                                        {changes.map(([field, change]) => (
                                            <li key={field} className="text-base-content/80">
                                                <span className="font-medium">
                                                    {field in PERSON_FIELDS
                                                        ? t(
                                                              PERSON_FIELDS[
                                                                  field as keyof typeof PERSON_FIELDS
                                                              ] as "person.fields.surname",
                                                          )
                                                        : field}
                                                </span>
                                                : {show(field, change.from)} →{" "}
                                                {show(field, change.to)}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
