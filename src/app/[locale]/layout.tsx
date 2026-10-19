import type { Metadata, Viewport } from "next";
import { Inter, Literata } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { VersionLine } from "@/components/layout/version-line";
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

    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    const t = await getTranslations({ locale, namespace: "app" });

    return {
        title: {
            default: t("title"),
            template: `%s — ${t("title")}`,
        },
        description: t("tagline"),
        applicationName: t("name"),
        /** Browsers ask for /favicon.ico by default; the logo tree is served as /icon.svg. */
        icons: { icon: "/icon.svg" },
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
                        <a
                            href="#content"
                            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-field focus:bg-base-100 focus:px-4 focus:py-2 focus:shadow-lg"
                        >
                            {t("skipToContent")}
                        </a>

                        <SiteHeader />

                        <main
                            id="content"
                            tabIndex={-1}
                            className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"
                        >
                            {children}
                        </main>

                        <footer className="border-base-300 border-t px-4 py-6 text-base-content/60 text-xs">
                            {/*
                                One line: the note about where the data lives, and the version at the
                                right of it (a narrow screen simply puts the version after the note),
                                so naming the version does not make the footer taller.
                            */}
                            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center sm:justify-between sm:text-left">
                                <p>{t("footer")}</p>
                                <VersionLine />
                            </div>
                        </footer>
                    </ThemeProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
