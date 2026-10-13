"use client";

/**
 * Familee - accepting an invitation.
 *
 * Two modes. "signed-in": the person is already logged in as the invited address,
 * so accepting is one button. "new": the invitee creates the account here, with
 * the name and password, and is signed in right after.
 */

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { acceptInvitationAction } from "@/lib/actions/access";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN } from "@/lib/validation";

export function InviteAcceptForm({
    token,
    email,
    mode,
    redirectTo,
}: {
    token: string;
    email: string;
    mode: "signed-in" | "new";
    /** Already carries the language prefix. */
    redirectTo: string;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get("name") ?? "");
        const password = String(form.get("password") ?? "");
        const repeat = String(form.get("passwordRepeat") ?? "");

        if (mode === "new" && password !== repeat) {
            setError(t("validation.passwordsDiffer"));
            return;
        }

        setError(null);
        startTransition(async () => {
            const result = await acceptInvitationAction({
                token,
                name: mode === "new" ? name : undefined,
                password: mode === "new" ? password : undefined,
            });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }

            if (mode === "new") {
                const signIn = await authClient.signIn.email({ email, password });
                if (signIn.error) {
                    setError(t("auth.invalidCredentials"));
                    return;
                }
            }

            router.replace(redirectTo);
            router.refresh();
        });
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {mode === "new" && (
                <>
                    <label className="flex flex-col gap-1.5">
                        <span className="font-medium text-sm">{t("auth.name")}</span>
                        <input name="name" required className="input w-full" autoComplete="name" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="font-medium text-sm">{t("auth.password")}</span>
                        <input
                            name="password"
                            type="password"
                            required
                            minLength={PASSWORD_MIN}
                            autoComplete="new-password"
                            className="input w-full"
                        />
                        <span className="text-base-content/60 text-xs">
                            {t("auth.passwordHint")}
                        </span>
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="font-medium text-sm">{t("auth.passwordConfirm")}</span>
                        <input
                            name="passwordRepeat"
                            type="password"
                            required
                            minLength={PASSWORD_MIN}
                            autoComplete="new-password"
                            className="input w-full"
                        />
                    </label>
                </>
            )}

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={pending}>
                <Check className="size-4" />
                {t("auth.acceptInvitation")}
            </button>
        </form>
    );
}
