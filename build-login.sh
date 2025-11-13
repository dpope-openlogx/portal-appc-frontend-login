#!/bin/bash

set -e

echo "▶️ Building Login SPA..."

# Absolute paths (adjust if needed)
LOGIN_REPO="."

cd "$LOGIN_REPO"
npm ci --no-audit --no-fund --prefer-offline
npx vite build

echo "📁 Copying Login SPA component assets..."
find src/components -name "component.html" -o -name "component.css" | while read filepath; do
  dest="dist/${filepath#src/}"
  mkdir -p "$(dirname "$dest")"
  cp "$filepath" "$dest"
done

echo "🔧 Fixing CSS asset paths for production..."
find dist/components -name "component.css" -exec sed -i '' 's|url(\x27/assets/|url(\x27../../assets/|g' {} \;

echo "✅ Login SPA build complete. Output: dist/"