"use client";

/**
 * Familee - the first-run form: creates the administrator account.
 *
 * After the account exists the form signs the person in and moves on. The
 * server closes the page for good once any account exists.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { setupAction } from "@/lib/actions/access";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN } from "@/lib/validation";

export function SetupForm({ next }: { next: string }) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get("name") ?? "");
        const email = String(form.get("email") ?? "");
        const password = String(form.get("password") ?? "");
        const repeat = String(form.get("passwordRepeat") ?? "");

        if (password !== repeat) {
            setError(t("validation.passwordsDiffer"));
            return;
        }

        setError(null);
        startTransition(async () => {
            const result = await setupAction({ name, email, password });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }

            const signIn = await authClient.signIn.email({ email: result.email, password });
            if (signIn.error) {
                setError(t("auth.invalidCredentials"));
                return;
            }
            router.replace(next);
            router.refresh();
        });
    }

    return (
        <form onSubmit={onSubmit} className="card card-border w-full max-w-sm bg-base-100">
            <div className="card-body gap-4">
                <h1 className="font-semibold font-serif text-2xl">{t("auth.setupTitle")}</h1>
                <p className="text-base-content/70 text-sm">{t("auth.setupSubtitle")}</p>

                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.name")}</span>
                    <input name="name" required className="input w-full" autoComplete="name" />
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.email")}</span>
                    <input
                        name="email"
                        type="email"
                        required
                        className="input w-full"
                        autoComplete="email"
                    />
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
                    {t("auth.createAccount")}
                </button>
            </div>
        </form>
    );
}
