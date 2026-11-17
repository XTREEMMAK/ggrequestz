/**
 * Regression tests for the card badge (issue #31).
 *
 * GameCard fell back to "Available" for any game that was not popular or newly
 * released, so every card claimed the game was in the linked library. The
 * badge now appears only for games a library lookup marked.
 */

import { describe, expect, it } from "vitest";
import { isInLibrary } from "$lib/libraryStatus.js";

const DAY = 24 * 60 * 60 * 1000;

describe("isInLibrary", () => {
  it.each([
    [
      "an IGDB game nothing is known about (the reported case)",
      { title: "Pokemon Tactics", igdb_id: "1" },
    ],
    ["a popular game", { title: "Popular", popularity: 95 }],
    [
      "a newly released game",
      { title: "New", release_date: new Date(Date.now() - DAY).toISOString() },
    ],
    [
      "a game a lookup found absent",
      { title: "Absent", in_library: false, is_in_romm: false },
    ],
    [
      "a game carrying only a status string",
      { title: "Status only", status: "available" },
    ],
    ["nothing", null],
    ["undefined", undefined],
  ])("is false for %s", (_label, game) => {
    expect(isInLibrary(game)).toBe(false);
  });

  it.each([
    ["a game a lookup found present", { in_library: true }],
    ["a game from the library itself", { is_library_game: true }],
    ["a game marked with the deprecated alias", { is_in_romm: true }],
  ])("is true for %s", (_label, game) => {
    expect(isInLibrary(game)).toBe(true);
  });

  it("does not treat truthy non-boolean values as a library claim", () => {
    expect(isInLibrary({ in_library: "false" })).toBe(false);
    expect(isInLibrary({ in_library: 1 })).toBe(false);
  });
});
