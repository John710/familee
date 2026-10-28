/**
 * Familee - who may change a member, and who may hand out a reset link
 *
 * A reset link takes the account over, so it must follow the same rank rule as any other change
 * of membership: a stronger role reaches a weaker one, and only the owner reaches an owner. The
 * matrix below is the rule the members page draws and the reset action enforces. The link reaches
 * the whole account, so the rule must hold in every tree the person belongs to.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    atLeast,
    canManageMember,
    canResetAccount,
    canResetPassword,
    MEMBER_ROLES,
    type MemberRole,
} from "@/lib/roles";

test("the roles are ordered from the strongest to the weakest", () => {
    assert.equal(atLeast("owner", "admin"), true);
    assert.equal(atLeast("admin", "admin"), true);
    assert.equal(atLeast("editor", "admin"), false);
    assert.equal(atLeast("viewer", "viewer"), true);
    assert.deepEqual([...MEMBER_ROLES], ["owner", "admin", "editor", "viewer"]);
});

test("the owner may reset anyone, an admin only an editor or a viewer", () => {
    for (const target of MEMBER_ROLES) {
        assert.equal(canResetPassword("owner", target), true, `owner -> ${target}`);
    }

    assert.equal(canResetPassword("admin", "owner"), false);
    assert.equal(canResetPassword("admin", "admin"), false);
    assert.equal(canResetPassword("admin", "editor"), true);
    assert.equal(canResetPassword("admin", "viewer"), true);

    for (const viewer of ["editor", "viewer"] as MemberRole[]) {
        for (const target of MEMBER_ROLES) {
            assert.equal(canResetPassword(viewer, target), false, `${viewer} -> ${target}`);
        }
    }
});

test("a reset link from one's own tree does not reach an owner of another tree", () => {
    // The attack: Mallory creates a tree, invites the owner of the main tree as a viewer, and once
    // the owner accepts, Mallory is the owner and the target a viewer there.
    const mallory = {
        globalRole: "viewer",
        memberships: [{ treeId: "side", role: "owner" }],
    } as const;
    const owner = {
        globalRole: "viewer",
        memberships: [
            { treeId: "main", role: "owner" },
            { treeId: "side", role: "viewer" },
        ],
    } as const;
    assert.equal(canResetAccount(mallory, owner), false);

    // Being a member of the main tree is not enough either: the rank rule holds in each tree.
    const mainAdmin = {
        globalRole: "viewer",
        memberships: [
            { treeId: "main", role: "admin" },
            { treeId: "side", role: "owner" },
        ],
    } as const;
    assert.equal(canResetAccount(mainAdmin, owner), false);

    // The owner of both trees may reset a viewer of both.
    const both = {
        globalRole: "viewer",
        memberships: [
            { treeId: "main", role: "owner" },
            { treeId: "side", role: "owner" },
        ],
    } as const;
    const viewer = {
        globalRole: "viewer",
        memberships: [
            { treeId: "main", role: "viewer" },
            { treeId: "side", role: "editor" },
        ],
    } as const;
    assert.equal(canResetAccount(both, viewer), true);
    assert.equal(canResetAccount(mainAdmin, viewer), true);
});

test("an administrator of the archive is reset only by another one", () => {
    const tree = [{ treeId: "main", role: "viewer" }] as const;
    const owner = [{ treeId: "main", role: "owner" }] as const;
    const globalAdmin = { globalRole: "admin", memberships: tree };

    assert.equal(canResetAccount({ globalRole: "editor", memberships: owner }, globalAdmin), false);
    assert.equal(canResetAccount({ globalRole: "admin", memberships: owner }, globalAdmin), true);
    // The global role alone does not reach past the rank rule of the trees.
    assert.equal(
        canResetAccount(
            { globalRole: "admin", memberships: [{ treeId: "main", role: "editor" }] },
            { globalRole: "viewer", memberships: tree },
        ),
        false,
    );
    // An account outside every tree is never reached through a tree.
    const outside = { globalRole: "viewer", memberships: [] };
    assert.equal(canResetAccount({ globalRole: "admin", memberships: owner }, outside), false);
});

test("a member never manages themselves, and nobody manages the owner through the page", () => {
    for (const viewer of MEMBER_ROLES) {
        assert.equal(canManageMember(viewer, viewer, true), false, `${viewer} manages self`);
        // The owner changes their own account on the profile page, not here.
        assert.equal(canManageMember(viewer, "owner", false), false);
    }

    assert.equal(canManageMember("owner", "admin", false), true);
    assert.equal(canManageMember("owner", "editor", false), true);
    assert.equal(canManageMember("admin", "admin", false), false);
    assert.equal(canManageMember("admin", "editor", false), true);
    assert.equal(canManageMember("admin", "viewer", false), true);
    assert.equal(canManageMember("editor", "viewer", false), false);
});
