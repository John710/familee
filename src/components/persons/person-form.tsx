"use client";

/**
 * Familee - the form of a person's card: names, sex, life dates and notes.
 *
 * Used both for a new person and for editing one. Dates are typed as people
 * write them (see src/lib/fuzzy-date.ts). The death date is the only thing that
 * marks a person as deceased.
 */

import { Check, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";

import { DateField } from "@/components/date-field";
import { useRouter } from "@/i18n/navigation";
import { createPersonAction, updatePersonAction } from "@/lib/actions/persons";

export type PersonFormValues = {
    surname: string;
    given: string;
    patronymic: string;
    sex: "male" | "female" | "other" | "unknown";
    birth: string;
    death: string;
    notes: string;
};

const SEX_OPTIONS = ["unknown", "male", "female", "other"] as const;

export function PersonForm({
    slug,
    personId,
    initial,
    isLiving,
}: {
    slug: string;
    /** Absent for a new person. */
    personId?: string;
    initial: PersonFormValues;
    /** Shown after the save, so the editor sees the result of the death date at once. */
    isLiving?: boolean | null;
}) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [pending, startTransition] = useTransition();

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values = {
            surname: String(form.get("surname") ?? ""),
            given: String(form.get("given") ?? ""),
            patronymic: String(form.get("patronymic") ?? ""),
            sex: String(form.get("sex") ?? "unknown") as PersonFormValues["sex"],
            birth: String(form.get("birth") ?? ""),
            death: String(form.get("death") ?? ""),
            notes: String(form.get("notes") ?? ""),
        };

        setError(null);
        setSaved(false);
        startTransition(async () => {
            if (personId) {
                const result = await updatePersonAction({ slug, personId, ...values });
                if (!result.ok) {
                    setError(t(result.error as Parameters<typeof t>[0]));
                    return;
                }
                setSaved(true);
                router.refresh();
                return;
            }

            const result = await createPersonAction({ slug, ...values });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.push(`/trees/${slug}/persons/${result.personId}`);
        });
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("person.fields.surname")}</span>
                    <input name="surname" defaultValue={initial.surname} className="input w-full" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("person.fields.given")}</span>
                    <input name="given" defaultValue={initial.given} className="input w-full" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("person.fields.patronymic")}</span>
                    <input
                        name="patronymic"
                        defaultValue={initial.patronymic}
                        className="input w-full"
                    />
                </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                    <span className="font-medium text-sm">{t("person.fields.sex")}</span>
                    <select name="sex" defaultValue={initial.sex} className="select w-full">
                        {SEX_OPTIONS.map((sex) => (
                            <option key={sex} value={sex}>
                                {t(`enums.sex.${sex}`)}
                            </option>
                        ))}
                    </select>
                </label>
                <DateField
                    name="birth"
                    label={t("person.fields.birth")}
                    defaultValue={initial.birth}
                    placeholder="1921-04-12"
                />
                <DateField
                    name="death"
                    label={t("person.fields.death")}
                    defaultValue={initial.death}
                    placeholder="1988"
                />
            </div>
            <p className="text-base-content/60 text-xs">{t("person.dateHint")}</p>

            <label className="flex flex-col gap-1.5">
                <span className="font-medium text-sm">{t("person.fields.notes")}</span>
                <textarea
                    name="notes"
                    defaultValue={initial.notes}
                    rows={4}
                    className="textarea w-full"
                />
            </label>

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <div className="flex items-center gap-3">
                <button type="submit" className="btn btn-primary" disabled={pending}>
                    <Save className="size-4" />
                    {t("common.save")}
                </button>
                {saved && (
                    <span className="flex items-center gap-1 text-sm text-success">
                        <Check className="size-4" />
                        {t("common.saved")}
                        {isLiving === false && ` · ${t("person.deceased")}`}
                    </span>
                )}
            </div>
        </form>
    );
}
