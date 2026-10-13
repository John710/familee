/**
 * Familee - the authentication client for the browser
 *
 * Sign-in and sign-out forms call this client. It talks to /api/auth on the same
 * origin, so no base URL is needed here.
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
