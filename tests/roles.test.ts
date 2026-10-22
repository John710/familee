/**
 * Familee - who may change a member, and who may hand out a reset link
 *
 * A reset link takes the account over, so it must follow the same rank rule as any other change
 * of membership: a stronger role reaches a weaker one, and only the owner reaches an owner. The
 * matrix below is the rule the members page draws and the reset action enforces.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    atLeast,
    canManageMember,
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
