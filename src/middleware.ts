/**
 * Familee - detecting the language of a request
 *
 * The middleware does two things: it works out the language (the cookie,
 * then Accept-Language) and rewrites the path onto the internal [locale]
 * segment. Russian stays without a prefix, English lives at /en.
 *
 * A note about Next.js 16: middleware.ts works, but at startup a hint may
 * appear suggesting it be renamed to proxy.ts - renaming the file is
 * enough, the contents stay as they are.
 */

import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
    /**
     * Left alone:
     *   /api/...   - sign-in (better-auth) and serving the photographs,
     *   /_next/... - the Next.js build,
     *   anything with a dot in the name - favicon.ico, robots.txt, manifest.
     */
    matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
