/**
 * Who may change whose account and roles through the user management API.
 *
 * `/admin/api/users/update` and `/admin/api/users/bulk-update` checked only
 * that the caller held `user.edit` (or `user.ban`, `user.delete`). Neither
 * stopped a caller assigning a role to their own account, nor a
 * non-administrator granting the `admin` role, so any custom role given
 * `user.edit` could make itself an administrator (GHSA-9j76-3g65-pr26). The
 * edit form in admin/users/[id]/edit had both checks; the API did not.
 *
 * The rules, for every action on these endpoints:
 *
 * 1. Nobody changes their own roles. Another administrator must.
 * 2. Only an administrator assigns or removes an admin-level role: `admin`
 *    itself, or any role carrying an `admin.*` permission.
 * 3. Only an administrator acts on an administrator's account at all, so a
 *    `user.edit` holder cannot deactivate, ban or delete one either.
 *
 * Holding the action's own permission is still checked by the caller first.
 */

import { query } from "$lib/database.js";
import { userHasPermission } from "$lib/userProfile.js";

const ROLE_CHANGES = new Set(["assign_role", "remove_role"]);

/**
 * A positive integer id, or null.
 * @param {unknown} value
 * @returns {number|null}
 */
function toId(value) {
  const id = typeof value === "string" ? Number(value.trim()) : value;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Whether a role grants administrative access.
 * @returns {Promise<{name: string, adminLevel: boolean}|null>} - null if absent
 */
async function describeRole(roleId) {
  const result = await query(
    `SELECT r.name,
            (r.name = 'admin' OR EXISTS (
              SELECT 1 FROM ggr_role_permissions rp
              JOIN ggr_permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = r.id
                AND (p.name = 'admin.*' OR p.name LIKE 'admin.%')
            )) AS admin_level
       FROM ggr_roles r
      WHERE r.id = $1`,
    [roleId],
  );
  if (result.rows.length === 0) return null;
  return {
    name: result.rows[0].name,
    adminLevel: !!result.rows[0].admin_level,
  };
}

/**
 * Ids among `userIds` that are administrators, by flag or by role.
 * @param {number[]} userIds
 * @returns {Promise<number[]>}
 */
async function administratorsAmong(userIds) {
  const result = await query(
    `SELECT u.id
       FROM ggr_users u
      WHERE u.id = ANY($1::int[])
        AND (u.is_admin = TRUE OR EXISTS (
              SELECT 1 FROM ggr_user_roles ur
              JOIN ggr_roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id AND r.name = 'admin' AND ur.is_active = TRUE
            ))`,
    [userIds],
  );
  return result.rows.map((row) => Number(row.id));
}

/**
 * Refusal for a user-management action, or null when it may proceed.
 *
 * @param {Object} input
 * @param {number} input.actorId - The caller's local user id, from the session
 * @param {Array<number|string>} input.targetIds - Accounts the action touches
 * @param {string} input.action - The endpoint's action name
 * @param {number|string} [input.roleId] - For assign_role / remove_role
 * @returns {Promise<{status: number, error: string}|null>}
 */
export async function refuseUserManagementAction({
  actorId,
  targetIds,
  action,
  roleId,
}) {
  const actor = toId(actorId);
  const targets = targetIds.map(toId);

  if (actor === null || targets.length === 0 || targets.includes(null)) {
    return { status: 400, error: "Invalid user id" };
  }

  const changesRoles = ROLE_CHANGES.has(action);

  // Compared as numbers: the old check was `user_id === localUserId`, which a
  // body sending the id as a string ("2") walked straight past.
  if (changesRoles && targets.includes(actor)) {
    return {
      status: 403,
      error:
        "You cannot change your own roles. Another administrator must do this.",
    };
  }

  if (changesRoles && toId(roleId) === null) {
    return { status: 400, error: "Role ID required for this action" };
  }

  // `admin.*` is what userHasPermission treats as full access, and it also
  // answers true for the is_admin flag.
  if (await userHasPermission(actor, "admin.*")) {
    return null;
  }

  if (changesRoles) {
    const role = await describeRole(toId(roleId));
    if (!role) {
      return { status: 404, error: "Role not found" };
    }
    if (role.adminLevel) {
      return {
        status: 403,
        error: `Only administrators can assign or remove the '${role.name}' role.`,
      };
    }
  }

  if ((await administratorsAmong(targets)).length > 0) {
    return {
      status: 403,
      error: "Only administrators can change an administrator's account.",
    };
  }

  return null;
}
