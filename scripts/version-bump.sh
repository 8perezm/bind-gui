#!/bin/bash

# Version bump script for bind-dns-gui
# Usage: ./scripts/version-bump.sh [patch|minor|major]

set -e

BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Usage: $0 [patch|minor|major]"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./bind-gui/package.json').version")
echo "Current version: $CURRENT_VERSION"

# Bump version using npm version
cd bind-gui
NEW_VERSION=$(npm version $BUMP_TYPE --no-git-tag-version)
cd ..

# Remove the 'v' prefix that npm adds
NEW_VERSION=${NEW_VERSION#v}

echo "New version: $NEW_VERSION"

# Commit the version change
git add bind-gui/package.json
git commit -m "Bump version to $NEW_VERSION"

# Create git tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "Version bumped to $NEW_VERSION"
echo "Tag 'v$NEW_VERSION' created"
echo "Remember to push with: git push origin main --tags"
