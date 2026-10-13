"use client";

/**
 * Familee - the name, the user name and the password of the signed-in person.
 *
 * The name and the user name go through better-auth's updateUser; the password
 * through changePassword, which needs the current one. Other sessions are ended
 * when the password changes.
 */

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN } from "@/lib/validation";

export function ProfileForm({ name, username }: { name: string; username: string }) {
    const t = useTranslations();
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onProfile(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const newName = String(form.get("name") ?? "").trim();
        const newUsername = String(form.get("username") ?? "").trim();

        setError(null);
        setMessage(null);
        startTransition(async () => {
            const result = await authClient.updateUser({
                name: newName,
                ...(newUsername !== "" ? { username: newUsername } : {}),
            });
            if (result.error) {
                setError(t("profile.saveFailed"));
                return;
            }
            setMessage(t("common.saved"));
        });
    }

    function onPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const current = String(form.get("currentPassword") ?? "");
        const password = String(form.get("newPassword") ?? "");
        const repeat = String(form.get("newPasswordRepeat") ?? "");

        if (password !== repeat) {
            setError(t("validation.passwordsDiffer"));
            return;
        }

        setError(null);
        setMessage(null);
        startTransition(async () => {
            const result = await authClient.changePassword({
                currentPassword: current,
                newPassword: password,
                revokeOtherSessions: true,
            });
            if (result.error) {
                setError(t("profile.passwordFailed"));
                return;
            }
            formElement.reset();
            setMessage(t("profile.passwordChanged"));
        });
    }

    return (
        <div className="flex flex-col gap-8">
            <form onSubmit={onProfile} className="flex flex-col gap-4">
                <h2 className="font-semibold text-lg">{t("profile.details")}</h2>
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.name")}</span>
                    <input name="name" defaultValue={name} required className="input w-full" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("profile.username")}</span>
                    <input name="username" defaultValue={username} className="input w-full" autoComplete="username" />
                    <span className="text-base-content/60 text-xs">{t("profile.usernameHint")}</span>
                </label>
                <button type="submit" className="btn btn-primary self-start" disabled={pending}>
                    {t("common.save")}
                </button>
            </form>

            <form onSubmit={onPassword} className="flex flex-col gap-4">
                <h2 className="font-semibold text-lg">{t("profile.password")}</h2>
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("profile.currentPassword")}</span>
                    <input name="currentPassword" type="password" required className="input w-full" autoComplete="current-password" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.newPassword")}</span>
                    <input name="newPassword" type="password" required minLength={PASSWORD_MIN} className="input w-full" autoComplete="new-password" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("auth.passwordConfirm")}</span>
                    <input name="newPasswordRepeat" type="password" required minLength={PASSWORD_MIN} className="input w-full" autoComplete="new-password" />
                </label>
                <button type="submit" className="btn btn-primary self-start" disabled={pending}>
                    {t("profile.changePassword")}
                </button>
            </form>

            {message && (
                <p role="status" className="flex items-center gap-1 text-success text-sm">
                    <Check className="size-4" />
                    {message}
                </p>
            )}
            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}
        </div>
    );
}
