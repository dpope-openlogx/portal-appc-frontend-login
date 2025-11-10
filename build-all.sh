#!/bin/bash

set -e  # Exit on error

# Absolute paths (adjust if needed)
LOGIN_REPO="../portal-neutra-narc-frontend-login"
MAIN_REPO="../portal-neutra-narc-frontend"

# Compute absolute dist paths early
LOGIN_DIST_ABS="$(cd "$LOGIN_REPO" && pwd)/dist"
MAIN_DIST_ABS="$(cd "$MAIN_REPO" && pwd)/dist"

echo "▶️ Building Login SPA..."
cd "$LOGIN_REPO"
npm install
npx vite build
echo "📁 Copying Login SPA component assets..."
find src/components -name "component.html" -o -name "component.css" | while read filepath; do
  dest="dist/${filepath#src/}"
  mkdir -p "$(dirname "$dest")"
  cp "$filepath" "$dest"
done

echo "✅ Login SPA built to $LOGIN_DIST_ABS"

echo "▶️ Building Main SPA into Login SPA's /dist/secure/"
cd "$MAIN_REPO"
npm install
npx vite build
echo "📂 Main SPA dist contents:" && ls -l dist
echo "📁 Copying Main SPA component assets..."
find src/components -name "component.html" -o -name "component.css" | while read filepath; do
  dest="dist/secure/${filepath#src/}"
  mkdir -p "$(dirname "$dest")"
  cp "$filepath" "$dest"
done

echo "📁 Login SPA path $LOGIN_DIST_ABS";
echo "📁 Main SPA path $MAIN_DIST_ABS";

echo "📁 Removing old secure build from Login SPA dist/"
rm -rf "$LOGIN_DIST_ABS/secure"
mkdir -p "$LOGIN_DIST_ABS"

if [ ! -d "$MAIN_DIST_ABS/secure" ]; then
  echo "❌ Error: $MAIN_DIST_ABS/secure does not exist. Main SPA build may have failed or incorrect base path."
  exit 1
fi

echo "📁 Copying new secure build from Main SPA dist/"
cp -r "$MAIN_DIST_ABS/secure" "$LOGIN_DIST_ABS/"

echo "✅ Main SPA built into $LOGIN_DIST_ABS/secure"

echo "📦 Combined production build is ready in: $LOGIN_DIST_ABS"

# Optional: Copy combined build to www testing directory
WWW_DIR="../www"
WWW_TARGET="$(cd "$WWW_DIR" && pwd)"
echo "📁 Copying build to testing directory at $WWW_TARGET"
rm -rf "$WWW_TARGET"
mkdir -p "$WWW_TARGET"
cp -r "$LOGIN_DIST_ABS/"* "$WWW_TARGET"

echo "✅ Build copied to testing directory: $WWW_TARGET"

#Optional: Restart nginx if installed
if command -v nginx >/dev/null 2>&1; then
  if pgrep -f "nginx: master process" > /dev/null; then
    echo "🔁 Nginx is already running. Reloading..."
    nginx -s reload
  else
    echo "🔁 Nginx is not running. Starting..."
    nginx
  fi
else
  echo "ℹ️ Nginx not found. Skipping restart."
fi