/**
 * Familee - tokens of invitations
 *
 * The link carries a random token. The database keeps only its SHA-256 hash, so
 * a leaked table cannot be turned into working links. The raw token is shown to
 * the inviter once, at creation.
 */

import { createHash, randomBytes } from "node:crypto";

export const INVITATION_DAYS = 7;

export function createInvitationToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}
