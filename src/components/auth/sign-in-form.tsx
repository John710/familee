"use client";

/**
 * Familee - the sign-in form
 *
 * Calls better-auth from the browser; the session cookie is set by the server.
 * The error text is always the generic "wrong email or password": it must not
 * reveal whether an account exists.
 */

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { authClient } from "@/lib/auth-client";

/** `next` already carries the language prefix (see localizedPath), so next/navigation is used. */
export function SignInForm({ next }: { next: string }) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const identifier = String(form.get("email") ?? "").trim();
        const password = String(form.get("password") ?? "");

        setError(null);
        startTransition(async () => {
            // An address goes to the e-mail sign-in, anything else is a user name.
            const result = identifier.includes("@")
                ? await authClient.signIn.email({ email: identifier, password })
                : await authClient.signIn.username({ username: identifier, password });
            if (result.error) {
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
                <h1 className="font-semibold font-serif text-2xl">{t("auth.signInTitle")}</h1>
                <p className="text-base-content/70 text-sm">{t("auth.signInSubtitle")}</p>

                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.emailOrUsername")}</span>
                    <input
                        name="email"
                        type="text"
                        autoComplete="username"
                        required
                        className="input w-full"
                    />
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.password")}</span>
                    <input
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className="input w-full"
                    />
                </label>

                {error && (
                    <p role="alert" className="text-error text-sm">
                        {error}
                    </p>
                )}

                <button type="submit" className="btn btn-primary w-full" disabled={pending}>
                    <LogIn className="size-4" />
                    {t("auth.signIn")}
                </button>
            </div>
        </form>
    );
}
