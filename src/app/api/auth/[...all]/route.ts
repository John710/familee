/**
 * Familee - the authentication endpoints
 *
 * Every /api/auth/* request (sign-in, sign-out, session) goes to better-auth.
 * The middleware leaves /api alone, so the locale is not involved here.
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
