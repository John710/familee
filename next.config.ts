/**
 * Familee - Next.js configuration
 *
 * The application is built into a single container and runs behind traefik.
 * Postgres and Redis are external and already running on the server.
 */

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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

    /** There is no need to advertise the Next.js version in the headers. */
    poweredByHeader: false,

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
             * some size: the default 1 MB is far too little for a scan.
             */
            bodySizeLimit: "25MB" as const,
        },
    },

    /** Request logs for the database and the files read better in one format. */
    logging: {
        fetches: { fullUrl: false },
    },
};

export default withNextIntl(nextConfig);
