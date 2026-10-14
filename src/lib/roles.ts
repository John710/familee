/**
 * Familee - the roles of a tree (no server-only imports)
 *
 * Kept apart from tree-access.ts on purpose: client components import the list of
 * roles to draw the form, and the database modules must never reach the browser.
 *
 * The roles, from the strongest to the weakest:
 *   owner   - everything, including the tree itself
 *   admin   - manages members and invitations
 *   editor  - writes the archive (shown to people as "co-author")
 *   viewer  - reads the archive
 */

export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** The roles an invitation may grant. The owner is never given by invitation. */
export const INVITABLE_ROLES = ["admin", "editor", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const RANK: Record<MemberRole, number> = {
    owner: 4,
    admin: 3,
    editor: 2,
    viewer: 1,
};

/** Whether `role` includes the rights of `minimum`. */
export function atLeast(role: MemberRole, minimum: MemberRole): boolean {
    return RANK[role] >= RANK[minimum];
}
