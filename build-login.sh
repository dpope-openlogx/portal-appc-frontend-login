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
echo "Looking for CSS files in: dist/components/"
ls -la dist/components/ 2>/dev/null || echo "No components directory found"
find dist/components -name "component.css" -exec echo "Processing: {}" \;

# Linux-compatible sed (GitHub Actions uses Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  find dist/components -name "component.css" -exec sed -i '' "s|url('/assets/|url('../../assets/|g" {} \;
else
  # Linux (GitHub Actions)
  find dist/components -name "component.css" -exec sed -i "s|url('/assets/|url('../../assets/|g" {} \;
fi

echo "🔍 Verifying CSS path replacement..."
find dist/components -name "component.css" -exec grep "url(" {} \;

echo "✅ Login SPA build complete. Output: dist/"