#!/bin/bash

# GG Requestz Release Helper Script
# Creates and pushes version tags to trigger automated releases

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to validate version format
validate_version() {
    if [[ ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_error "Invalid version format. Use semantic versioning (e.g., 1.0.3)"
        exit 1
    fi
}

# Function to check if version exists in CHANGELOG.md
check_changelog() {
    local version=$1
    if ! grep -q "^## \[$version\]" CHANGELOG.md; then
        print_error "Version [$version] not found in CHANGELOG.md"
        print_warning "Please update CHANGELOG.md before creating a release"
        exit 1
    fi
    print_success "Version $version found in CHANGELOG.md"
}

# Function to check git status
check_git_status() {
    if [[ -n $(git status --porcelain) ]]; then
        print_error "Working directory is not clean. Commit or stash changes first."
        git status --short
        exit 1
    fi
    print_success "Working directory is clean"
}

# Function to check if tag already exists
check_existing_tag() {
    local tag=$1
    if git tag | grep -q "^$tag$"; then
        print_error "Tag $tag already exists"
        print_warning "Use 'git tag -d $tag' to delete it first, or choose a different version"
        exit 1
    fi
}

# Function to get current version from package.json
get_current_version() {
    node -p "require('./package.json').version"
}

# Function to update package.json version
update_package_version() {
    local version=$1
    print_status "Updating package.json version to $version"
    npm version --no-git-tag-version $version
}

# Main script
main() {
    echo "🚀 GG Requestz Release Helper"
    echo "=============================="
    
    # Check if we're in the right directory
    if [[ ! -f package.json ]] || [[ ! -f CHANGELOG.md ]]; then
        print_error "This script must be run from the project root directory"
        exit 1
    fi
    
    # Get version argument
    if [[ -z $1 ]]; then
        echo "Usage: $0 <version>"
        echo "Example: $0 1.0.3"
        echo ""
        echo "Current version: $(get_current_version)"
        exit 1
    fi
    
    local version=$1
    local tag="v$version"
    
    print_status "Preparing release for version $version"
    
    # Validate inputs
    validate_version $version
    check_git_status
    check_existing_tag $tag
    check_changelog $version
    
    # Update package.json version
    update_package_version $version
    
    # Show confirmation
    echo ""
    print_warning "Ready to create release:"
    echo "  📦 Version: $version"
    echo "  🏷️  Tag: $tag"
    echo "  📝 Changelog: Available"
    echo "  🔗 Repository: $(git remote get-url origin)"
    echo ""
    
    read -p "Continue with release? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Release cancelled"
        # Reset package.json changes
        git checkout -- package.json package-lock.json 2>/dev/null || true
        exit 0
    fi
    
    # Commit version bump
    print_status "Committing version bump"
    git add package.json package-lock.json
    git commit -m "bump: version $version"
    
    # Create and push tag
    print_status "Creating tag $tag"
    git tag -a $tag -m "Release $tag"
    
    print_status "Pushing to origin"
    git push origin main
    git push origin $tag
    
    print_success "Release $tag created successfully!"
    echo ""
    print_status "GitHub Actions will now:"
    echo "  ✅ Run tests and build"
    echo "  ✅ Extract changelog content"
    echo "  ✅ Create GitHub release"
    echo "  ✅ Upload release artifacts"
    echo ""
    print_status "Monitor progress at: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"
}

main "$@"