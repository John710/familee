"use client";

/**
 * Familee - changing a member's role and revoking their access.
 *
 * Shown only to people who may manage this member (the server checks again). The
 * revoke button asks first: a revoked member loses the tree at once, and the
 * person's chosen self in it goes with the membership.
 */

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { changeMemberRoleAction, removeMemberAction } from "@/lib/actions/members";
import { INVITABLE_ROLES, type MemberRole } from "@/lib/roles";

export function MemberControls({
    slug,
    userId,
    name,
    role,
}: {
    slug: string;
    userId: string;
    name: string;
    role: MemberRole;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onRoleChange(nextRole: string) {
        setError(null);
        startTransition(async () => {
            const result = await changeMemberRoleAction({ slug, userId, role: nextRole });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    function onRemove() {
        if (!window.confirm(t("members.removeConfirm", { name }))) return;
        setError(null);
        startTransition(async () => {
            const result = await removeMemberAction({ slug, userId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <select
                aria-label={t("members.role")}
                className="select select-sm w-auto"
                value={role}
                disabled={pending}
                onChange={(event) => onRoleChange(event.target.value)}
            >
                {INVITABLE_ROLES.map((option) => (
                    <option key={option} value={option}>
                        {t(`enums.member_role.${option}`)}
                    </option>
                ))}
            </select>
            <button
                type="button"
                className="btn btn-ghost btn-sm text-error"
                onClick={onRemove}
                disabled={pending}
            >
                {t("members.remove")}
            </button>
            {error && (
                <p role="alert" className="w-full text-end text-error text-xs">
                    {error}
                </p>
            )}
        </div>
    );
}
