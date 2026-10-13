import type { Metadata, Viewport } from "next";
import { Inter, Literata } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { routing } from "@/i18n/routing";
import "../globals.css";

/**
 * Fonts: Inter for the interface, Literata for the headings - serifs suit
 * a family archive. Both are loaded with Cyrillic, otherwise Russian names
 * would be drawn with a fallback font.
 */
const inter = Inter({
    subsets: ["latin", "cyrillic"],
    variable: "--font-inter",
    display: "swap",
});

const literata = Literata({
    subsets: ["latin", "cyrillic"],
    variable: "--font-literata",
    display: "swap",
});

/** Both locales (and any future ones) are built ahead of time. */
export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
    colorScheme: "light dark",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fdfcfb" },
        { media: "(prefers-color-scheme: dark)", color: "#1c1a18" },
    ],
};

type LocaleParams = { locale: string };

export async function generateMetadata({
    params,
}: {
    params: Promise<LocaleParams>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "app" });

    return {
        title: {
            default: t("title"),
            template: `%s — ${t("title")}`,
        },
        description: t("tagline"),
        applicationName: t("name"),
        /** A family archive has no business in search engines. */
        robots: { index: false, follow: false },
    };
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<LocaleParams>;
}) {
    const { locale } = await params;

    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    /** Makes it possible to render pages with translations statically. */
    setRequestLocale(locale);

    const t = await getTranslations("app");

    return (
        <html
            lang={locale}
            className={`${inter.variable} ${literata.variable}`}
            suppressHydrationWarning
        >
            <body className="flex min-h-dvh flex-col antialiased">
                <NextIntlClientProvider>
                    <ThemeProvider>
                        <SiteHeader />

                        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

                        <footer className="border-base-300 text-base-content/60 border-t px-4 py-6 text-center text-xs">
                            {t("footer")}
                        </footer>
                    </ThemeProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
