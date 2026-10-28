/**
 * Familee - Next.js configuration
 *
 * The application is built into a single container and runs behind traefik.
 * Postgres and Redis are external and already running on the server.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * The version of package.json, read here, at build time. The application shows it in the footer and
 * compares it with the newest release on GitHub, and the Docker image carries the same number in its
 * tag - so it must come from the file, not from an environment variable that a deploy could forget.
 */
function versionFromPackage(): string {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
        version?: unknown;
    };
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
        throw new Error("package.json carries no version");
    }
    return manifest.version;
}

/**
 * The languages are the message files: messages/<code>.json is one language. The list is read
 * here, at build time, and handed to the application as FAMILEE_LOCALES, so that a new file
 * is a new language without any code change. English is the base language: every other
 * language falls back to it for the keys it has not translated, so it must always be there.
 */
function languagesFromMessages(): string[] {
    const codes = readdirSync(path.join(process.cwd(), "messages"))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .filter((code) => /^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/.test(code))
        .sort();
    if (!codes.includes("en"))
        throw new Error("messages/en.json is missing: English is the base language");
    return codes;
}

/**
 * The NextConfig type is deliberately not used: some keys (for instance
 * experimental.serverActions) are described differently across minor
 * versions of Next.js, and a strict annotation would break `tsc --noEmit`
 * after an upgrade. Next.js reports bad keys itself at startup.
 */
const nextConfig = {
    /**
     * A .next/standalone build: the Docker image receives only the server
     * bundle and the modules it needs, without dev dependencies.
     */
    output: "standalone" as const,

    /**
     * The language codes, read from the message files (see languagesFromMessages), and the version
     * of this build, which the footer shows and the update check compares against GitHub.
     */
    env: {
        FAMILEE_LOCALES: JSON.stringify(languagesFromMessages()),
        FAMILEE_VERSION: versionFromPackage(),
    },

    /** There is no need to advertise the Next.js version in the headers. */
    poweredByHeader: false,

    /**
     * The headers every answer carries. They are set here, and not by the proxy: in the
     * address-and-port mode there is nothing in front of the application. frame-ancestors only
     * forbids putting the archive in a frame of another site; a full script-src policy is left to
     * the reverse proxy, which knows the addresses it serves.
     */
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    // A browser that has seen the archive over HTTPS keeps to it for a year, so a
                    // request cannot be talked down to plain HTTP on a hostile network. Plain-HTTP
                    // installations are unaffected: browsers ignore the header without TLS.
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=31536000; includeSubDomains",
                    },
                    // The archive needs none of these: files come from the file picker, and the map
                    // draws tiles without asking where the reader is.
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
                    },
                ],
            },
            // The lightbox shows a PDF in an <iframe> of the archive's own page, which the rule
            // above forbids. When two rules match a path and set the same key, the later one wins
            // (Next.js docs, "Header Overriding Behavior"), so the media route alone loosens the
            // two framing headers to the archive's own origin; other sites still cannot frame it.
            {
                source: "/api/trees/:slug/media/:path*",
                headers: [
                    { key: "X-Frame-Options", value: "SAMEORIGIN" },
                    { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
                ],
            },
        ];
    },

    /** React strict mode: the double render in dev exposes side effects. */
    reactStrictMode: true,

    /**
     * Photo previews are generated in advance by sharp and lie on disk as
     * ready-made files, so the built-in image optimizer of Next.js would
     * only waste CPU doing the same work twice.
     */
    images: {
        unoptimized: true,
    },

    /**
     * sharp is a native module and must not be bundled: it has to be
     * loaded from node_modules at run time.
     */
    serverExternalPackages: ["sharp"],

    experimental: {
        serverActions: {
            /**
             * Photo upload goes through a Route Handler
             * (src/app/api/trees/[slug]/persons/[personId]/photos), which checks
             * the size itself. Server actions still have to accept files of
             * some size: the default 1 MB is far too little for a scan. The GEDCOM
             * import (src/lib/actions/gedcom.ts) takes files up to 25 MB, sent as
             * base64, a third larger: 35 MB covers that and the rest of the form.
             */
            bodySizeLimit: "35MB" as const,
        },
        /**
         * The proxy (src/proxy.ts) runs on the pages, and a server action posts to
         * its page, so the body passes through the proxy first. Next.js keeps only
         * the first 10 MB of such a body by default and the action then fails to
         * read it; the limit follows the one of the server actions above.
         */
        proxyClientMaxBodySize: "35MB" as const,
    },

    /** Request logs for the database and the files read better in one format. */
    logging: {
        fetches: { fullUrl: false },
    },
};

export default withNextIntl(nextConfig);
