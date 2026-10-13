/**
 * Familee - the current user on the server
 *
 * Server components and server actions read the session from the request
 * headers (next/headers), never from the browser client. Pages that need a
 * signed-in person call requireUser(): it redirects to the sign-in page when
 * nobody is signed in, and returns the user otherwise.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { auth } from "@/lib/auth";

export type CurrentUser = {
    id: string;
    email: string;
    name: string;
    locale: string;
};

/** The signed-in user, or null. Never redirects. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;

    return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        locale: (session.user as { locale?: string }).locale ?? "ru",
    };
}

/**
 * Requires a signed-in user; otherwise sends the person to the sign-in page,
 * which returns them to `returnPath` (a path without the language prefix).
 */
export async function requireUser(locale: Locale, returnPath: string): Promise<CurrentUser> {
    const user = await getCurrentUser();
    if (!user) {
        const next = encodeURIComponent(returnPath);
        redirect(localizedPath(locale, `/sign-in?next=${next}`));
    }
    return user;
}
