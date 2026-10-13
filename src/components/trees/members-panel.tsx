"use client";

/**
 * Familee - inviting people and managing pending invitations.
 *
 * The link is shown once, right after creation: the server keeps only its hash,
 * so a link cannot be shown again later. A cancelled invitation stops working at
 * once.
 */

import { Copy, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { createInvitationAction, revokeInvitationAction } from "@/lib/actions/trees";
import { INVITABLE_ROLES, type InvitableRole, type MemberRole } from "@/lib/roles";

export type PendingInvitation = {
    id: string;
    email: string;
    role: MemberRole;
    expiresAt: string;
};

export function MembersPanel({
    slug,
    invitations,
}: {
    slug: string;
    invitations: PendingInvitation[];
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [pending, startTransition] = useTransition();

    function onInvite(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const email = String(form.get("email") ?? "");
        const role = String(form.get("role") ?? "viewer");

        setError(null);
        setCopied(false);
        startTransition(async () => {
            const result = await createInvitationAction({ slug, email, role });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            setLink({ url: result.url, expiresAt: result.expiresAt });
            event.currentTarget.reset();
            router.refresh();
        });
    }

    function onRevoke(invitationId: string) {
        startTransition(async () => {
            const result = await revokeInvitationAction({ slug, invitationId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    async function copyLink(url: string) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
    }

    return (
        <div className="flex flex-col gap-6">
            <form onSubmit={onInvite} className="card card-border bg-base-100">
                <div className="card-body gap-4">
                    <h2 className="flex items-center gap-2 font-semibold text-lg">
                        <UserPlus className="size-5 text-primary" />
                        {t("members.add")}
                    </h2>

                    <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                        <label className="flex flex-col gap-1.5">
                            <span className="font-medium text-sm">{t("members.inviteEmail")}</span>
                            <input name="email" type="email" required className="input w-full" />
                        </label>

                        <label className="flex flex-col gap-1.5">
                            <span className="font-medium text-sm">{t("members.inviteRole")}</span>
                            <select name="role" defaultValue="viewer" className="select w-full">
                                {INVITABLE_ROLES.map((role: InvitableRole) => (
                                    <option key={role} value={role}>
                                        {t(`enums.member_role.${role}`)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button type="submit" className="btn btn-primary" disabled={pending}>
                            {t("members.inviteSend")}
                        </button>
                    </div>

                    {error && (
                        <p role="alert" className="text-error text-sm">
                            {error}
                        </p>
                    )}

                    {link && (
                        <div className="alert alert-success flex-col items-start gap-2">
                            <p className="font-medium text-sm">{t("members.inviteLinkTitle")}</p>
                            <p className="text-xs">{t("members.inviteLinkHint")}</p>
                            <div className="flex w-full items-center gap-2">
                                <code className="input w-full overflow-x-auto font-mono text-xs">
                                    {link.url}
                                </code>
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => copyLink(link.url)}
                                >
                                    <Copy className="size-4" />
                                    {copied ? t("common.copied") : t("common.copy")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </form>

            <section className="flex flex-col gap-3">
                <h2 className="font-semibold text-lg">{t("members.pending")}</h2>

                {invitations.length === 0 ? (
                    <p className="text-base-content/60 text-sm">{t("members.noPending")}</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                        {invitations.map((invitation) => (
                            <li
                                key={invitation.id}
                                className="flex items-center justify-between gap-3 px-4 py-3"
                            >
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate font-medium text-sm">
                                        {invitation.email}
                                    </span>
                                    <span className="text-base-content/60 text-xs">
                                        {t(`enums.member_role.${invitation.role}`)} ·{" "}
                                        {t("members.expiresOn", {
                                            date: new Date(
                                                invitation.expiresAt,
                                            ).toLocaleDateString(),
                                        })}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm text-error"
                                    onClick={() => onRevoke(invitation.id)}
                                    disabled={pending}
                                >
                                    <Trash2 className="size-4" />
                                    {t("members.cancelInvitation")}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
