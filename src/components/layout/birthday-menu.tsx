"use client";

/**
 * Familee - the bell in the top bar: the birthdays of the next two weeks, across all trees.
 *
 * A disclosure, not a menu: a button that shows or hides a list of links (aria-expanded and
 * aria-controls), with no menu roles and no arrow-key navigation - Tab walks the links. It closes
 * on a click outside, on Escape and when the page changes. The list is computed on the server;
 * this part only shows it and keeps it open or shut.
 */

import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { PersonThumb } from "@/components/persons/person-thumb";
import { Link } from "@/i18n/navigation";
import { useEscapeLayer } from "@/lib/focus-trap";

export type BirthdayItem = {
    key: string;
    href: string;
    name: string;
    treeTitle: string;
    /** The day as the reader sees it: "12 April" or "today". */
    dayLabel: string;
    /** The age the person turns, already formatted. */
    turnsLabel: string;
    photoUrl: string | null;
};

export function BirthdayMenu({
    label,
    emptyLabel,
    items,
}: {
    label: string;
    emptyLabel: string;
    items: BirthdayItem[];
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const pathname = usePathname();

    // Going to another page closes the menu. The pathname is the trigger, not an input.
    // biome-ignore lint/correctness/useExhaustiveDependencies: a change of page is what closes it
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // A click outside the list closes it.
    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        return () => document.removeEventListener("mousedown", onPointer);
    }, [open]);

    // So does Escape, but not when a window lies over the page (the palette): that one goes first.
    useEscapeLayer(open, () => setOpen(false));

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                className="btn btn-ghost btn-sm btn-square relative"
                aria-label={label}
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen((value) => !value)}
            >
                <Bell className="size-4" />
                {items.length > 0 && (
                    <span className="badge badge-primary badge-xs absolute -top-1 -right-1">
                        {items.length}
                    </span>
                )}
            </button>

            {open && (
                <section
                    id={listId}
                    aria-label={label}
                    className="card card-border absolute right-0 z-30 mt-2 w-80 bg-base-100 p-2 shadow-lg"
                >
                    <p className="px-2 pt-1 pb-2 font-medium text-sm">{label}</p>
                    {items.length === 0 ? (
                        <p className="px-2 pb-2 text-base-content/60 text-sm">{emptyLabel}</p>
                    ) : (
                        <ul className="flex max-h-80 flex-col overflow-y-auto">
                            {items.map((item) => (
                                <li key={item.key}>
                                    <Link
                                        href={item.href}
                                        className="flex items-center gap-3 rounded-field px-2 py-2 hover:bg-base-200"
                                    >
                                        <PersonThumb name={item.name} photoUrl={item.photoUrl} />
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span className="font-medium text-sm">{item.name}</span>
                                            <span className="text-base-content/60 text-xs">
                                                {item.dayLabel} · {item.turnsLabel} ·{" "}
                                                {item.treeTitle}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}
