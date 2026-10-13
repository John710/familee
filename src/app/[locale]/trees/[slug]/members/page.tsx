import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MembersPanel, type PendingInvitation } from "@/components/trees/members-panel";
import { routing } from "@/i18n/routing";
import { listMembers, listPendingInvitations } from "@/lib/invitations";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

export default async function MembersPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/members`);

    // Outsiders get the same 404 as a tree that does not exist: no hints about it.
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const canInvite = atLeast(access.role, "admin");
    const [members, invitations] = await Promise.all([
        listMembers(access.treeId),
        canInvite ? listPendingInvitations(access.treeId) : Promise.resolve([]),
    ]);

    const pending: PendingInvitation[] = invitations.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: row.expiresAt.toISOString(),
    }));

    const t = await getTranslations();

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-1">
                <h1 className="font-semibold font-serif text-3xl">{access.title}</h1>
                <p className="text-base-content/60 text-sm">
                    {t("members.title")} · {t(`enums.member_role.${access.role}`)}
                </p>
            </header>

            <section className="flex flex-col gap-3">
                <h2 className="font-semibold text-lg">{t("members.members")}</h2>
                <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                    {members.map((member) => (
                        <li
                            key={member.userId}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                            <div className="flex min-w-0 flex-col">
                                <span className="truncate font-medium text-sm">
                                    {member.name || member.email}
                                </span>
                                <span className="truncate text-base-content/60 text-xs">
                                    {member.email}
                                </span>
                            </div>
                            <span className="badge badge-soft">
                                {t(`enums.member_role.${member.role}`)}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            {canInvite && <MembersPanel slug={slug} invitations={pending} />}
        </div>
    );
}
