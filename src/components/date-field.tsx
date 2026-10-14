"use client";

/**
 * Familee - a date field with a calendar.
 *
 * The text field takes dates as people write them: "1921-04-12", "1921-04",
 * "1921", "about 1920" (see src/lib/fuzzy-date.ts). The calendar button opens the
 * browser's own date picker and writes the chosen day into the text field as
 * YYYY-MM-DD. The picker is a hidden input without a name, so only the text is
 * submitted.
 */

import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function DateField({
    name,
    label,
    defaultValue,
    placeholder,
}: {
    name: string;
    label: string;
    defaultValue: string;
    placeholder?: string;
}) {
    const t = useTranslations("date");
    const [value, setValue] = useState(defaultValue);
    const pickerRef = useRef<HTMLInputElement>(null);

    function openCalendar() {
        const picker = pickerRef.current;
        if (!picker) return;
        // Start the calendar on the date already typed, if it is a full day.
        picker.value = ISO_DAY.test(value) ? value : "";
        if (typeof picker.showPicker === "function") {
            picker.showPicker();
        } else {
            picker.focus();
            picker.click();
        }
    }

    return (
        <div className="flex flex-col gap-1.5">
            <span className="font-medium text-sm">{label}</span>
            <div className="relative">
                <input
                    name={name}
                    type="text"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    className="input w-full pr-12"
                />
                <button
                    type="button"
                    onClick={openCalendar}
                    className="btn btn-ghost btn-sm btn-square absolute top-1/2 right-1 -translate-y-1/2"
                    aria-label={t("pick")}
                    title={t("pick")}
                >
                    <CalendarDays className="size-4" />
                </button>
                <input
                    ref={pickerRef}
                    type="date"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                    onChange={(event) => {
                        if (event.target.value) setValue(event.target.value);
                    }}
                />
            </div>
        </div>
    );
}
