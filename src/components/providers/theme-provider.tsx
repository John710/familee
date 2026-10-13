"use client";

/**
 * Familee - switching between the light and the dark theme
 *
 * next-themes puts two markers on <html> at once:
 *   class="dark"        - for the dark: variants of Tailwind and shadcn/ui,
 *   data-theme="dark"   - for the daisyUI themes.
 * So both libraries are switched by a single action.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider
            attribute={["class", "data-theme"]}
            defaultTheme="system"
            themes={["light", "dark"]}
            enableSystem
            disableTransitionOnChange
            {...props}
        >
            {children}
        </NextThemesProvider>
    );
}
