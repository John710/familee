import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProfileForm } from "@/components/profile/profile-form";
import { SelfPersonSelect } from "@/components/profile/self-person-select";
import { SessionsList, type SignedInDevice } from "@/components/profile/sessions-list";
import { db, schema } from "@/db";
import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { listPersonOptions } from "@/lib/unions";

/** The longest user agent shown; the rest is noise for the person reading the list. */
const DEVICE_LABEL_CHARS = 90;

type Params = { locale: string };

export default async function ProfilePage({ params }: { params: Promise<Params> }) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, "/profile");
    const t = await getTranslations();

    const [account] = await db
        .select({ name: schema.users.name, username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);

    // The token itself never leaves the server: the list carries only the row id.
    const current = await auth.api.getSession({ headers: await headers() });
    const rows = await db
        .select({
            id: schema.sessions.id,
            token: schema.sessions.token,
            userAgent: schema.sessions.userAgent,
            createdAt: schema.sessions.createdAt,
            updatedAt: schema.sessions.updatedAt,
        })
        .from(schema.sessions)
        .where(and(eq(schema.sessions.userId, user.id), gt(schema.sessions.expiresAt, new Date())))
        .orderBy(desc(schema.sessions.updatedAt));

    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    const devices: SignedInDevice[] = rows.map((row) => ({
        id: row.id,
        device: (row.userAgent ?? "").slice(0, DEVICE_LABEL_CHARS),
        startedOn: dateFormat.format(row.createdAt),
        activeOn: dateFormat.format(row.updatedAt),
        current: row.token === current?.session.token,
    }));

    const memberships = await db
        .select({
            treeId: schema.trees.id,
            slug: schema.trees.slug,
            title: schema.trees.title,
            selfPersonId: schema.treeMembers.selfPersonId,
        })
        .from(schema.treeMembers)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMembers.treeId))
        .where(eq(schema.treeMembers.userId, user.id))
        .orderBy(schema.trees.title);

    const sections = await Promise.all(
        memberships.map(async (membership) => ({
            slug: membership.slug,
            title: membership.title,
            selected: membership.selfPersonId,
            options: (await listPersonOptions(membership.treeId)).map((person) => ({
                personId: person.personId,
                name: person.name ?? "",
            })),
        })),
    );

    return (
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
            <section className="card card-border bg-base-100">
                <div className="card-body gap-4">
                    <h1 className="font-semibold font-serif text-3xl">{t("profile.title")}</h1>
                    <p className="text-base-content/60 text-sm">{user.email}</p>
                    <ProfileForm name={account?.name ?? ""} username={account?.username ?? ""} />
                </div>
            </section>

            <section className="flex flex-col gap-4 lg:col-span-2">
                <h2 className="font-semibold text-lg">{t("profile.sessionsTitle")}</h2>
                <p className="text-base-content/60 text-sm">{t("profile.sessionsHint")}</p>
                <SessionsList devices={devices} />
            </section>

            <section className="flex flex-col gap-6">
                <h2 className="font-semibold text-lg">{t("profile.whoAmITitle")}</h2>
                <p className="text-base-content/60 text-sm">{t("profile.whoAmIHint")}</p>
                {sections.length === 0 ? (
                    <p className="text-base-content/60 text-sm">{t("home.noTrees")}</p>
                ) : (
                    sections.map((section) => (
                        <div key={section.slug} className="flex flex-col gap-2">
                            <span className="font-medium text-sm">{section.title}</span>
                            <SelfPersonSelect
                                slug={section.slug}
                                options={section.options}
                                selected={section.selected}
                            />
                        </div>
                    ))
                )}
            </section>
        </div>
    );
}
