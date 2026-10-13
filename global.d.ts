/**
 * Familee - types for the translations
 *
 * The Russian message file is declared the reference: from then on `t('...')`
 * suggests the keys that exist and goes red on a typo.
 * The files of other languages may be incomplete - they are layered on top
 * of the Russian one in src/i18n/request.ts.
 */

import type { formats } from "@/i18n/request";
import type { Locale } from "@/i18n/routing";
import type ruMessages from "./messages/ru.json";

declare module "next-intl" {
    interface AppConfig {
        Locale: Locale;
        Messages: typeof ruMessages;
        Formats: typeof formats;
    }
}
