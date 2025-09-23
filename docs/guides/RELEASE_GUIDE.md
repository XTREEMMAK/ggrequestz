# Release Guide

This guide explains how to create releases for GG Requestz using the automated release system.

## Overview

The project uses automated GitHub releases that are triggered by version tags. When you push a version tag, GitHub Actions will:

1. ✅ Run tests and build the application
2. ✅ Extract changelog content for the version
3. ✅ Create a GitHub release with proper formatting
4. ✅ Upload release artifacts (source code archive)

## Prerequisites

- Ensure you have write access to the repository
- Your working directory should be clean (no uncommitted changes)
- The new version should be documented in `CHANGELOG.md`

## Creating a Release

### Step 1: Update CHANGELOG.md

Add your new version section to `CHANGELOG.md` following the existing format:

```markdown
## [1.0.3] - 2025-08-19

### Added

- New feature descriptions

### Changed

- What was changed

### Fixed

- Bug fixes
```

### Step 2: Use the Release Helper Script

The easiest way to create a release is using the provided script:

```bash
# Create a release for version 1.0.3
npm run release 1.0.3
```

Or run the script directly:

```bash
scripts/create-release.sh 1.0.3
```

The script will:

- ✅ Validate the version format
- ✅ Check that the version exists in CHANGELOG.md
- ✅ Ensure your working directory is clean
- ✅ Update package.json version
- ✅ Create and push the version tag
- ✅ Trigger the automated release workflow

### Step 3: Manual Tag Creation (Alternative)

If you prefer to create tags manually:

```bash
# Update package.json version
npm version 1.0.3

# Create and push the tag
git tag v1.0.3
git push origin main
git push origin v1.0.3
```

## What Happens Next

Once you push a version tag:

1. **GitHub Actions runs** (`.github/workflows/release.yml`)
2. **Tests execute** to ensure code quality
3. **Application builds** to verify it compiles correctly
4. **Changelog extracts** the relevant section for release notes
5. **GitHub release creates** with:
   - Formatted release notes from CHANGELOG.md
   - Installation instructions
   - Links to documentation
   - Source code archive attachment

## Monitoring Releases

- Monitor the release process in the **Actions** tab of your GitHub repository
- The release will appear in the **Releases** section once complete
- Any errors will be visible in the GitHub Actions logs

## Release Artifacts

Each release includes:

- **Source code** (ZIP and TAR.GZ)
- **Built application** archive (`ggrequestz-v1.0.3.tar.gz`)
- **Release notes** extracted from CHANGELOG.md
- **Installation instructions** for Docker and manual setup

## Troubleshooting

### Tag Already Exists

```bash
# Delete the tag locally and remotely
git tag -d v1.0.3
git push origin --delete v1.0.3

# Create the tag again
git tag v1.0.3
git push origin v1.0.3
```

### Version Not in CHANGELOG.md

- Add the version section to CHANGELOG.md
- Commit the changes
- Try creating the release again

### GitHub Actions Fails

- Check the Actions tab for detailed error logs
- Common issues:
  - Test failures
  - Build errors
  - Missing permissions

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (1.X.0): New features, backwards compatible
- **PATCH** (1.0.X): Bug fixes, backwards compatible

### Examples:

- `1.0.3` → Bug fixes
- `1.1.0` → New features
- `2.0.0` → Breaking changes

## Best Practices

1. **Test before releasing**: Ensure your code works in development
2. **Update documentation**: Keep README.md and guides current
3. **Write clear changelog entries**: Help users understand what changed
4. **Follow semantic versioning**: Makes version impact clear
5. **Test the release**: Verify the release process worked correctly

## Release Schedule

- **Patch releases** (bug fixes): As needed
- **Minor releases** (features): Monthly
- **Major releases** (breaking changes): Quarterly

## Getting Help

If you encounter issues with the release process:

1. Check the [GitHub Actions logs](../../actions)
2. Review this guide for common solutions
3. Create an issue if the problem persists
4. Contact the development team

---

**Next:** [Contributing Guide](../../CONTRIBUTING.md) | **Back:** [Documentation Index](../README.md)
