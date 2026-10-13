"use client";

/**
 * Familee - choosing "me" in one tree.
 *
 * A single choice per tree, made here instead of a checkbox on every card. The
 * list is the people of the tree; the server refuses a person already chosen by
 * another member.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { setSelfPersonAction } from "@/lib/actions/profile";

export function SelfPersonSelect({
    slug,
    options,
    selected,
}: {
    slug: string;
    options: { personId: string; name: string }[];
    selected: string | null;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onChange(value: string) {
        setError(null);
        startTransition(async () => {
            const result = await setSelfPersonAction({
                slug,
                personId: value === "" ? null : value,
            });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-1.5">
            <select
                className="select w-full"
                defaultValue={selected ?? ""}
                disabled={pending}
                onChange={(event) => onChange(event.target.value)}
                aria-label={t("profile.whoAmI")}
            >
                <option value="">{t("profile.notChosen")}</option>
                {options.map((option) => (
                    <option key={option.personId} value={option.personId}>
                        {option.name}
                    </option>
                ))}
            </select>
            {error && (
                <p role="alert" className="text-error text-xs">
                    {error}
                </p>
            )}
        </div>
    );
}
