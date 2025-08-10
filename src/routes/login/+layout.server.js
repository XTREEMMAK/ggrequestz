/**
 * Login layout data loader - minimal data, no navigation
 */

export async function load({ parent }) {
  const { user } = await parent();
  
  return {
    user: user || null
  };
}