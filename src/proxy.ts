/**
 * Familee - detecting the language of a request
 *
 * The proxy (Next.js 16 calls the request hook "proxy"; the file was middleware.ts before) does
 * two things: it works out the language (the cookie, then Accept-Language) and rewrites the path
 * onto the internal [locale] segment. Russian stays without a prefix, English lives at /en.
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
