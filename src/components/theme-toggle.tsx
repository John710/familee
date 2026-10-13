"use client";

/**
 * Familee - choosing the theme
 *
 * Three states: light, dark and "same as the system". Before mounting the
 * real theme is unknown (the next-themes script sets it), so the icon
 * appears only after hydration - otherwise the server and the browser
 * would draw different icons.
 *
 * The dropdown is a native <details> element, like the language switcher:
 * the keyboard and the focus are handled by the browser.
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
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

    useEffect(() => {
        setMounted(true);
    }, []);

    const CurrentIcon = resolvedTheme === "dark" ? Moon : Sun;

    function choose(value: (typeof options)[number]["value"], menu: HTMLDetailsElement) {
        menu.open = false;
        setTheme(value);
    }

    return (
        <details className="dropdown dropdown-end">
            <summary
                className="btn btn-ghost btn-sm btn-circle"
                aria-label={t("label")}
                title={t("label")}
            >
                {mounted ? <CurrentIcon className="size-4" /> : <span className="size-4" />}
            </summary>

            <ul className="dropdown-content menu z-30 mt-2 w-48 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300">
                {options.map(({ value, icon: Icon, key }) => (
                    <li key={value}>
                        <button
                            type="button"
                            onClick={(event) =>
                                choose(
                                    value,
                                    event.currentTarget.closest("details") as HTMLDetailsElement,
                                )
                            }
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
        </details>
    );
}
