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

/**
 * Whether a member with `viewer` may change the membership of `target`: an admin manages the
 * editors and the viewers, the owner manages everyone but themselves, and nobody manages
 * themselves through this page (the profile serves that).
 */
export function canManageMember(viewer: MemberRole, target: MemberRole, isSelf: boolean): boolean {
    if (isSelf || target === "owner") return false;
    return viewer === "owner" || (atLeast(viewer, "admin") && !atLeast(target, "admin"));
}

/**
 * Whether `viewer` may hand a password reset link to `target`. The link takes the account over,
 * so it follows the rank rule: an admin may reset an editor or a viewer, and only the owner may
 * reset an owner or another admin. The server calls this too, not only the page.
 */
export function canResetPassword(viewer: MemberRole, target: MemberRole): boolean {
    return viewer === "owner" || (atLeast(viewer, "admin") && !atLeast(target, "admin"));
}

/** One membership of an account: a tree and the role the account has in it. */
export type Membership = { treeId: string; role: MemberRole };

/** What decides whether an account may be reset: its global role and all its memberships. */
export type AccountStanding = { globalRole: string; memberships: readonly Membership[] };

/**
 * Whether `issuer` may hand a reset link for `target`'s account. The link takes over the whole
 * account, not one membership, so the rank rule must hold in every tree the target belongs to:
 * otherwise anyone could create a tree, invite the owner of another tree as a viewer and, once
 * they accept, reset them from there. The issuer must be a member of each of those trees and
 * outrank the target there, and a global administrator is reset only by another one.
 */
export function canResetAccount(issuer: AccountStanding, target: AccountStanding): boolean {
    if (target.globalRole === "admin" && issuer.globalRole !== "admin") return false;
    // A reset link is issued from a tree, so an account outside every tree is never reached.
    if (target.memberships.length === 0) return false;

    const issuerRoles = new Map(issuer.memberships.map((entry) => [entry.treeId, entry.role]));
    return target.memberships.every((entry) => {
        const issuerRole = issuerRoles.get(entry.treeId);
        return issuerRole !== undefined && canResetPassword(issuerRole, entry.role);
    });
}
