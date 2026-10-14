"use client";

/**
 * Familee - the profile menu in the top bar.
 *
 * A client component, so that it closes when the page changes, when the person
 * clicks anywhere else, and on Escape. The header itself is not re-rendered by a
 * navigation, so a native <details> element would stay open.
 */

import { Settings, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Link } from "@/i18n/navigation";

export function ProfileMenu({
    label,
    title,
    profileLabel,
}: {
    label: string;
    title: string;
    profileLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    // Going to another page closes the menu.
    // biome-ignore lint/correctness/useExhaustiveDependencies: the menu closes on each pathname change; the body does not read it
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // A click outside the menu, or Escape, closes it.
    useEffect(() => {
        if (!open) return;

        function onPointer(event: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }

        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                aria-label={label}
                aria-expanded={open}
                title={title}
                onClick={() => setOpen((value) => !value)}
            >
                <UserRound className="size-5" />
            </button>

            {open && (
                <div className="card card-border absolute right-0 z-30 mt-2 w-64 overflow-hidden bg-base-100 shadow-lg">
                    <div className="flex items-center gap-3 border-base-300 border-b px-4 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <UserRound className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 truncate font-medium text-sm">{title}</span>
                    </div>
                    <ul className="flex flex-col p-1.5">
                        <li>
                            <Link
                                href="/profile"
                                className="flex items-center gap-3 rounded-field px-3 py-2 text-sm transition-colors hover:bg-base-200"
                            >
                                <Settings
                                    className="size-4 text-base-content/60"
                                    aria-hidden="true"
                                />
                                {profileLabel}
                            </Link>
                        </li>
                        <li className="mt-1 border-base-300 border-t pt-1">
                            <SignOutButton />
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
}
