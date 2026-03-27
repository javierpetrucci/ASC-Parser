#!/bin/bash
# Save as find-case-changes.sh

echo "Files with case mismatches between Git and filesystem:"
echo "=================================================="

git ls-files | while read tracked; do
    # Check if file exists with different case
    if [ -f "$tracked" ] 2>/dev/null; then
        # File exists with exact case
        continue
    else
        # Try to find it with case-insensitive search
        found=$(find . -maxdepth 1 -iname "$(basename "$tracked")" -type f 2>/dev/null | head -1)
        if [ -n "$found" ]; then
            echo "❌ Git tracks: $tracked"
            echo "✅ Filesystem has: ${found#./}"
            echo ""
        fi
    fi
done