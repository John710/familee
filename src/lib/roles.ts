/**
 * Familee - the roles of a tree (no server-only imports)
 *
 * Kept apart from tree-access.ts on purpose: client components import the list of
 * roles to draw the form, and the database modules must never reach the browser.
 */

export const MEMBER_ROLES = ["owner", "admin", "editor", "contributor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** The roles an invitation may grant. The owner is never given by invitation. */
export const INVITABLE_ROLES = ["admin", "editor", "contributor", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const RANK: Record<MemberRole, number> = {
    owner: 5,
    admin: 4,
    editor: 3,
    contributor: 2,
    viewer: 1,
};

/** Whether `role` includes the rights of `minimum`. */
export function atLeast(role: MemberRole, minimum: MemberRole): boolean {
    return RANK[role] >= RANK[minimum];
}
