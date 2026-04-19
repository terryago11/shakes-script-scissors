#!/usr/bin/env bash
# generate-icons.sh
#
# Converts electron/assets/icon.svg → icon.icns (macOS), icon.png (Linux),
# and optionally icon.ico (Windows, requires ImageMagick).
#
# Usage: bash scripts/generate-icons.sh
#
# Requirements (macOS built-ins, no brew needed):
#   qlmanage  — renders SVG to PNG
#   sips      — resizes PNG
#   iconutil  — assembles .icns from iconset
#
# For Windows .ico (optional): brew install imagemagick
#
# After running, commit the generated files:
#   git add electron/assets/icon.icns electron/assets/icon.png
#   git add electron/assets/icon.ico   # if generated
#   git commit -m "chore: add app icons"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../electron/assets"
SVG="$ASSETS_DIR/icon.svg"
ICONSET="$ASSETS_DIR/icon.iconset"
TMP_PNG="$ASSETS_DIR/icon-1024-tmp.png"

echo "→ Source SVG: $SVG"

# 1. Render SVG → 1024×1024 PNG via qlmanage
echo "→ Rendering SVG to PNG via qlmanage..."
TMP_DIR=$(mktemp -d)
qlmanage -t -s 1024 -o "$TMP_DIR" "$SVG" > /dev/null 2>&1
RENDERED="$TMP_DIR/icon.svg.png"
if [ ! -f "$RENDERED" ]; then
  echo "ERROR: qlmanage did not produce $RENDERED"
  echo "  Files in temp dir: $(ls "$TMP_DIR")"
  exit 1
fi
cp "$RENDERED" "$TMP_PNG"
rm -rf "$TMP_DIR"
echo "   ✓ Rendered to temp PNG"

# 2. Build iconset
echo "→ Building iconset..."
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

declare -a SIZES=(16 32 64 128 256 512 1024)
for SIZE in "${SIZES[@]}"; do
  OUT="$ICONSET/icon_${SIZE}x${SIZE}.png"
  sips -z "$SIZE" "$SIZE" "$TMP_PNG" --out "$OUT" > /dev/null
  echo "   ✓ icon_${SIZE}x${SIZE}.png"
  if [ "$SIZE" -le 512 ]; then
    DOUBLE=$((SIZE * 2))
    cp "$ICONSET/icon_${DOUBLE}x${DOUBLE}.png" "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" 2>/dev/null || true
  fi
done

# 3. Assemble .icns
echo "→ Assembling icon.icns..."
iconutil -c icns "$ICONSET" -o "$ASSETS_DIR/icon.icns"
echo "   ✓ $ASSETS_DIR/icon.icns"

# 4. icon.png for Linux
cp "$TMP_PNG" "$ASSETS_DIR/icon.png"
echo "   ✓ $ASSETS_DIR/icon.png"

# 5. icon.ico for Windows (optional, requires ImageMagick)
if command -v magick &> /dev/null; then
  echo "→ Generating icon.ico..."
  magick "$TMP_PNG" \
    \( -clone 0 -resize 16x16 \) \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 48x48 \) \( -clone 0 -resize 64x64 \) \
    \( -clone 0 -resize 128x128 \) \( -clone 0 -resize 256x256 \) \
    -delete 0 "$ASSETS_DIR/icon.ico"
  echo "   ✓ $ASSETS_DIR/icon.ico"
else
  echo "→ Skipping icon.ico (brew install imagemagick to generate)"
fi

# 6. Cleanup
rm -f "$TMP_PNG"
rm -rf "$ICONSET"

echo ""
echo "Done. Commit with:"
echo "  git add electron/assets/icon.svg electron/assets/icon.icns electron/assets/icon.png"
echo "  git add electron/assets/icon.ico 2>/dev/null || true"
echo "  git commit -m 'chore: add app icons'"
