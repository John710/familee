import { eq } from "drizzle-orm";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ProfileForm } from "@/components/profile/profile-form";
import { SelfPersonSelect } from "@/components/profile/self-person-select";
import { db, schema } from "@/db";
import { routing } from "@/i18n/routing";
import { listPersonOptions } from "@/lib/unions";
import { requireUser } from "@/lib/session";

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
