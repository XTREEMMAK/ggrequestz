/**
 * Whether a game is known to be in the linked library.
 *
 * The card badge used to fall back to "Available" for every game it knew
 * nothing about, so every card in every grid claimed the game was in the
 * library (issue #31). The badge is now a statement of fact: it appears only
 * when a library lookup marked the game, and an unmarked game shows nothing,
 * whatever else is known about it.
 *
 * The flags come from two places:
 * - `in_library` / `is_in_romm`, set by crossReferenceWithROMM in
 *   romm.server.js (true or false once a lookup has run, absent before);
 * - `is_library_game`, set on games that came from the library itself, such
 *   as the homepage "New in Library" shelf.
 *
 * @param {Object|null|undefined} game
 * @returns {boolean}
 */
export function isInLibrary(game) {
  return (
    game?.in_library === true ||
    game?.is_library_game === true ||
    game?.is_in_romm === true
  );
}
