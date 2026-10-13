"use client";

/**
 * Familee - setting a new password from a reset link.
 *
 * The token comes from the link the administrator handed out. On success the
 * person is sent to the sign-in page; all other sessions were ended by better-auth.
 */

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN } from "@/lib/validation";

export function ResetPasswordForm({ token, signInPath }: { token: string; signInPath: string }) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        const repeat = String(form.get("passwordRepeat") ?? "");

        if (password !== repeat) {
            setError(t("validation.passwordsDiffer"));
            return;
        }

        setError(null);
        startTransition(async () => {
            const result = await authClient.resetPassword({ newPassword: password, token });
            if (result.error) {
                setError(t("auth.resetInvalid"));
                return;
            }
            router.replace(signInPath);
        });
    }

    return (
        <form onSubmit={onSubmit} className="card card-border w-full max-w-sm bg-base-100">
            <div className="card-body gap-4">
                <h1 className="font-semibold font-serif text-2xl">{t("auth.resetTitle")}</h1>
                <p className="text-base-content/70 text-sm">{t("auth.resetSubtitle")}</p>

                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.newPassword")}</span>
                    <input
                        name="password"
                        type="password"
                        required
                        minLength={PASSWORD_MIN}
                        autoComplete="new-password"
                        className="input w-full"
                    />
                    <span className="text-base-content/60 text-xs">{t("auth.passwordHint")}</span>
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

                {error && (
                    <p role="alert" className="text-error text-sm">
                        {error}
                    </p>
                )}

                <button type="submit" className="btn btn-primary w-full" disabled={pending}>
                    <Check className="size-4" />
                    {t("auth.resetSubmit")}
                </button>
            </div>
        </form>
    );
}
