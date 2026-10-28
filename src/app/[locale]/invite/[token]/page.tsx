/**
 * Familee - the page an invitation link opens
 *
 * A link that is unknown, used, revoked or expired gets a notice and nothing else. A valid one
 * offers to accept it: straight away for a person signed in with the invited address (another
 * address is told it does not match), with an account created here for a new address, and with a
 * sign-in first when the address already has an account. The link is looked up by the hash of its
 * token.
 */

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";
import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { hashInvitationToken } from "@/lib/invitation-token";
import { findInvitationByHash } from "@/lib/invitations";
import { getCurrentUser } from "@/lib/session";

type Params = { locale: string; token: string };

export default async function InvitePage({ params }: { params: Promise<Params> }) {
    const { locale, token } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const t = await getTranslations();
    const invitation = await findInvitationByHash(hashInvitationToken(token));

    if (!invitation) {
        return <Notice message={t("auth.invitationInvalid")} />;
    }
    if (invitation.acceptedAt) {
        return <Notice message={t("auth.invitationUsed")} />;
    }
    if (invitation.revokedAt) {
        return <Notice message={t("auth.invitationRevoked")} />;
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
        return <Notice message={t("auth.invitationExpired")} />;
    }

    const redirectTo = localizedPath(locale, `/trees/${invitation.treeSlug}/members`);
    const current = await getCurrentUser();

    const header = (
        <header className="flex flex-col gap-1">
            <h1 className="font-semibold font-serif text-2xl">
                {t("auth.invitationTitle", { tree: invitation.treeTitle })}
            </h1>
            <p className="text-base-content/70 text-sm">
                {t("auth.invitationRole", {
                    role: t(`enums.member_role.${invitation.role}`),
                })}
            </p>
        </header>
    );

    if (current) {
        if (current.email !== invitation.email) {
            return <Notice message={t("auth.invitationEmailMismatch")} />;
        }
        return (
            <section className="card card-border mx-auto w-full max-w-md bg-base-100">
                <div className="card-body gap-5">
                    {header}
                    <InviteAcceptForm
                        token={token}
                        email={invitation.email}
                        mode="signed-in"
                        redirectTo={redirectTo}
                    />
                </div>
            </section>
        );
    }

    // Nobody is signed in. If the address already has an account, the invitee
    // must sign in first; otherwise the account is created right here.
    const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, invitation.email))
        .limit(1);

    if (existing) {
        return (
            <section className="card card-border mx-auto w-full max-w-md bg-base-100">
                <div className="card-body gap-4">
                    {header}
                    <p className="text-sm">{t("auth.accountExists")}</p>
                    <Link
                        href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
                        className="btn btn-primary"
                    >
                        {t("auth.signIn")}
                    </Link>
                </div>
            </section>
        );
    }

    return (
        <section className="card card-border mx-auto w-full max-w-md bg-base-100">
            <div className="card-body gap-5">
                {header}
                <p className="text-base-content/70 text-sm">{invitation.email}</p>
                <InviteAcceptForm
                    token={token}
                    email={invitation.email}
                    mode="new"
                    redirectTo={redirectTo}
                />
            </div>
        </section>
    );
}

function Notice({ message }: { message: string }) {
    return (
        <section className="card card-border mx-auto w-full max-w-md bg-base-100">
            <div className="card-body">
                <p role="status" className="text-sm">
                    {message}
                </p>
            </div>
        </section>
    );
}
