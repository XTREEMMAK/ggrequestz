/**
 * Version history, read from CHANGELOG.md.
 *
 * The file is inlined at build time with Vite's `?raw` rather than read from disk
 * at runtime. The production image does not ship it: the Dockerfile copies
 * `build`, `static`, `src`, `scripts` and `migrations`, and nothing else, so a
 * `readFile("CHANGELOG.md")` would have worked in dev and silently returned
 * nothing in Docker, which is the failure mode the engineering rules exist to
 * prevent. Inlining also keeps this off the filesystem on a render path entirely.
 */

import changelogRaw from "../../CHANGELOG.md?raw";

/**
 * The heading format is load-bearing elsewhere and must not be reformatted:
 * `.github/workflows/release.yml` awk-extracts release notes from it and
 * `scripts/create-release.sh` gates on `grep -q "^## \[$version\]"`. This reader is
 * therefore strict about the existing shape and adds no requirement of its own:
 * it matches what is already written and ignores anything that does not fit.
 *
 * `## [Unreleased]` carries no date and is not a release, so it is skipped.
 */
const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/;

/**
 * Released versions, newest first as they appear in the file.
 *
 * Each entry links to its GitHub release rather than to a changelog anchor.
 * `release.yml` publishes the same section as the release body, so the target is
 * equivalent, and it avoids depending on how GitHub slugifies a heading containing
 * brackets, periods and a date, a guess that would break silently.
 *
 * @param {number} limit - Maximum entries to return (0 for all)
 * @returns {Array<{version: string, date: string, url: string}>}
 */
export function getVersionHistory(limit = 10) {
  const releases = [];

  for (const line of changelogRaw.split("\n")) {
    const match = line.match(RELEASE_HEADING);
    if (!match) continue;

    const [, version, date] = match;
    releases.push({
      version,
      date,
      url: `https://github.com/XTREEMMAK/ggrequestz/releases/tag/v${version}`,
    });
  }

  return limit > 0 ? releases.slice(0, limit) : releases;
}
