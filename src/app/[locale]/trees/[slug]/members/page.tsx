import { eq } from "drizzle-orm";
import {
    BookOpen,
    CalendarDays,
    Download,
    History,
    Images,
    ListChecks,
    Map as MapIcon,
    MapPin,
    Search,
    TreeDeciduous,
    Upload,
    Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PersonThumb } from "@/components/persons/person-thumb";
import { DeleteTreeForm } from "@/components/trees/delete-tree-form";
import { MemberControls } from "@/components/trees/member-controls";
import { MembersPanel, type PendingInvitation } from "@/components/trees/members-panel";
import { ResetLinkButton } from "@/components/trees/reset-link-button";
import { TreeLogo } from "@/components/trees/tree-logo";
import { TreeLogoForm } from "@/components/trees/tree-logo-form";
import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { todayIn, upcomingBirthdays } from "@/lib/age";
import { BIRTHDAY_DAYS, birthdayInput } from "@/lib/birthdays";
import { listMembers, listPendingInvitations } from "@/lib/invitations";
import { listPersonCards } from "@/lib/people";
import { listTreePhotos } from "@/lib/photos";
import { atLeast, canManageMember, canResetPassword } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/**
 * Whether the viewer may change this member: an admin manages everyone but the owner
 * and other admins, the owner manages everyone but themselves. The server checks again.
 */
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

    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
    const pending: PendingInvitation[] = invitations.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        expiresOn: dateFormat.format(row.expiresAt),
    }));

    const t = await getTranslations();

    // The birthdays of this tree; the bell and the home page list those of all trees.
    const cards = await listPersonCards(access.treeId);
    const birthdays = upcomingBirthdays(
        cards.map((card) => birthdayInput(card, slug)),
        todayIn(),
        BIRTHDAY_DAYS,
    );
    const dayFormat = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    });

    const [treeRow] = await db
        .select({ logoData: schema.trees.logoData })
        .from(schema.trees)
        .where(eq(schema.trees.id, access.treeId))
        .limit(1);

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h1 className="font-semibold font-serif text-3xl">{access.title}</h1>
                        {atLeast(access.role, "admin") ? (
                            <TreeLogoForm
                                slug={slug}
                                logoData={treeRow?.logoData ?? null}
                                title={access.title}
                            />
                        ) : (
                            <TreeLogo
                                logoData={treeRow?.logoData ?? null}
                                title={access.title}
                                size="lg"
                            />
                        )}
                        <p className="text-base-content/60 text-sm">
                            {t("members.title")} · {t(`enums.member_role.${access.role}`)}
                        </p>
                    </div>

                    {/* The tools of the tree: they are not for everyday browsing, so they sit
                        in the corner, level with the title. */}
                    <div className="flex flex-wrap items-center gap-1 self-start pt-1">
                        <a
                            href={`/api/trees/${slug}/gedcom`}
                            download
                            className="btn btn-ghost btn-sm gap-2"
                        >
                            <Download className="size-4" aria-hidden="true" />
                            {t("gedcom.export")}
                        </a>
                        {atLeast(access.role, "editor") && (
                            <Link
                                href={`/trees/${slug}/import`}
                                className="btn btn-ghost btn-sm gap-2"
                            >
                                <Upload className="size-4" aria-hidden="true" />
                                {t("gedcom.import")}
                            </Link>
                        )}
                        {canInvite && (
                            <Link
                                href={`/trees/${slug}/history`}
                                className="btn btn-ghost btn-sm gap-2"
                            >
                                <History className="size-4" aria-hidden="true" />
                                {t("history.title")}
                            </Link>
                        )}
                    </div>
                </div>

                <nav className="flex flex-wrap gap-2">
                    <Link href={`/trees/${slug}/tree`} className="btn btn-primary btn-sm gap-2">
                        <TreeDeciduous className="size-4" aria-hidden="true" />
                        {t("tree.view.open")}
                    </Link>
                    <Link href={`/trees/${slug}/persons`} className="btn btn-sm gap-2">
                        <Users className="size-4" aria-hidden="true" />
                        {t("person.many")}
                    </Link>
                    <Link href={`/trees/${slug}/gallery`} className="btn btn-sm gap-2">
                        <Images className="size-4" aria-hidden="true" />
                        {t("gallery.title")}
                    </Link>
                    <Link href={`/trees/${slug}/calendar`} className="btn btn-sm gap-2">
                        <CalendarDays className="size-4" aria-hidden="true" />
                        {t("calendar.title")}
                    </Link>
                    <Link href={`/trees/${slug}/places`} className="btn btn-sm gap-2">
                        <MapPin className="size-4" aria-hidden="true" />
                        {t("place.many")}
                    </Link>
                    <Link href={`/trees/${slug}/map`} className="btn btn-sm gap-2">
                        <MapIcon className="size-4" aria-hidden="true" />
                        {t("map.title")}
                    </Link>
                    <Link href={`/trees/${slug}/sources`} className="btn btn-sm gap-2">
                        <BookOpen className="size-4" aria-hidden="true" />
                        {t("source.many")}
                    </Link>
                    <Link href={`/trees/${slug}/checks`} className="btn btn-sm gap-2">
                        <ListChecks className="size-4" aria-hidden="true" />
                        {t("checks.title")}
                    </Link>
                    <Link href={`/trees/${slug}/search`} className="btn btn-sm gap-2">
                        <Search className="size-4" aria-hidden="true" />
                        {t("search.title")}
                    </Link>
                </nav>
            </header>

            <section className="flex flex-col gap-3">
                <h2 className="font-semibold text-base-content/70 text-sm uppercase tracking-wide">
                    {t("birthdays.title")}
                </h2>
                {birthdays.length === 0 ? (
                    <p className="text-base-content/60 text-sm">{t("birthdays.none")}</p>
                ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {birthdays.map((entry) => (
                            <li key={entry.personId}>
                                <Link
                                    href={`/trees/${slug}/persons/${entry.personId}`}
                                    className="card card-border flex flex-row items-center gap-3 bg-base-100 p-3 transition-colors hover:border-primary"
                                >
                                    <PersonThumb name={entry.name} photoUrl={entry.photoUrl} />
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        <span className="font-medium text-sm">
                                            {entry.name || t("common.unknown")}
                                        </span>
                                        <span className="text-base-content/60 text-xs">
                                            {entry.inDays === 0
                                                ? t("birthdays.today")
                                                : dayFormat.format(
                                                      new Date(`${entry.date}T00:00:00Z`),
                                                  )}
                                            {" · "}
                                            {t("birthdays.turns", { count: entry.turns })}
                                        </span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

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
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {canManageMember(
                                    access.role,
                                    member.role,
                                    member.userId === user.id,
                                ) ? (
                                    <MemberControls
                                        slug={slug}
                                        userId={member.userId}
                                        name={member.name || member.email}
                                        role={member.role}
                                    />
                                ) : (
                                    <span className="badge badge-soft">
                                        {t(`enums.member_role.${member.role}`)}
                                    </span>
                                )}
                                {canResetPassword(access.role, member.role) &&
                                    member.userId !== user.id && (
                                        <ResetLinkButton slug={slug} email={member.email} />
                                    )}
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            {canInvite && <MembersPanel slug={slug} invitations={pending} />}

            {access.role === "owner" && (
                <section className="card card-border border-error/40 bg-base-100">
                    <div className="card-body gap-4">
                        <h2 className="font-semibold text-error text-lg">
                            {t("tree.delete.title")}
                        </h2>
                        <DeleteTreeForm
                            slug={slug}
                            persons={cards.length}
                            photos={(await listTreePhotos(access.treeId)).length}
                        />
                    </div>
                </section>
            )}
        </div>
    );
}
