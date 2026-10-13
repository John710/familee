/**
 * Familee - the authentication client for the browser
 *
 * Sign-in and sign-out forms call this client. It talks to /api/auth on the same
 * origin, so no base URL is needed here. The username plugin adds sign-in by user
 * name and the profile update of the user name.
 */

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    plugins: [usernameClient()],
});
