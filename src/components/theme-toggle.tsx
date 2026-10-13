"use client";

/**
 * Familee - choosing the theme
 *
 * Three states: light, dark and "same as the system". Before mounting the
 * real theme is unknown (the next-themes script sets it), so the icon
 * appears only after hydration - otherwise the server and the browser
 * would draw different icons.
 *
 * A client dropdown, like the language switcher: it closes on navigation, on a
 * click elsewhere, and on Escape.
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const options = [
    { value: "light", icon: Sun, key: "light" },
    { value: "dark", icon: Moon, key: "dark" },
    { value: "system", icon: Monitor, key: "system" },
] as const;

export function ThemeToggle() {
    const t = useTranslations("theme");
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const currentPath = usePathname();
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: the menu closes on each pathname change; the body does not read it
    useEffect(() => {
        setOpen(false);
    }, [currentPath]);

    useEffect(() => {
        if (!open) return;
        function onPointer(event: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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

    const CurrentIcon = resolvedTheme === "dark" ? Moon : Sun;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                aria-label={t("label")}
                aria-expanded={open}
                title={t("label")}
                onClick={() => setOpen((value) => !value)}
            >
                {mounted ? <CurrentIcon className="size-4" /> : <span className="size-4" />}
            </button>

            {open && (
                <ul className="menu absolute right-0 z-30 mt-2 w-48 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300">
                    {options.map(({ value, icon: Icon, key }) => (
                        <li key={value}>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    setTheme(value);
                                }}
                                className={cn(
                                    "flex items-center gap-2",
                                    mounted && theme === value && "menu-active",
                                )}
                                aria-current={mounted && theme === value ? "true" : undefined}
                            >
                                <Icon className="size-4" />
                                {t(key)}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
