/**
 * Familee - building addresses for server-side redirects
 *
 * next/navigation's redirect() knows nothing about the language, so a server
 * redirect has to carry the prefix itself. The rule is the one from routing.ts
 * ("as-needed"): the default language has no prefix, the others do.
 */

import { defaultLocale, type Locale } from "./routing";

export function localizedPath(locale: Locale, path: string): string {
    if (locale === defaultLocale) return path;
    return `/${locale}${path}`;
}
