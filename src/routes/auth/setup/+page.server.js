/**
 * Old setup route - redirects to new setup flow
 */

import { redirect } from "@sveltejs/kit";
import { needsInitialSetup } from "$lib/basicAuth.js";

export async function load() {
  try {
    const needsSetup = await needsInitialSetup();

    // If setup is needed, redirect to new setup flow
    if (needsSetup) {
      throw redirect(302, "/setup");
    }

    // If setup is not needed, redirect to login
    throw redirect(302, "/login");
  } catch (error) {
    // Handle redirects separately
    if (error?.status === 302) {
      throw error;
    }

    console.error("Setup redirect error:", error);
    // Default to new setup flow on error
    throw redirect(302, "/setup");
  }
}
