/**
 * Setup layout server - handles setup flow permissions and redirects
 */

import { redirect } from "@sveltejs/kit";

export async function load({ url, parent }) {
  const { user, needsSetup, authMethod } = await parent();

  // If setup is not needed (already complete), redirect away from setup pages
  if (!needsSetup) {
    throw redirect(302, "/");
  }

  // If setup is needed, allow access to setup pages
  return {
    user: user || null,
    needsSetup: needsSetup || false,
  };
}
