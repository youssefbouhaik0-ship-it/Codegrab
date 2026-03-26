#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# build-assets.sh — Generate .icns icon and .png DMG background from SVGs
#
# Usage:   ./scripts/build-assets.sh
# Requires: macOS (uses sips, iconutil, qlmanage)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_DIR="build"
ICON_SVG="$BUILD_DIR/icon.svg"
BG_SVG="$BUILD_DIR/background.svg"

echo "▸ Building assets from SVGs…"

# ── 1. Generate .icns from icon.svg ──────────────────────────────────────────
# macOS .icns requires multiple sizes in an .iconset folder

ICONSET_DIR="$BUILD_DIR/icon.iconset"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# First render SVG → 1024px master PNG using qlmanage (built into macOS)
echo "  ▸ Rendering icon SVG → master PNG"
qlmanage -t -s 1024 -o "$BUILD_DIR" "$ICON_SVG" 2>/dev/null || true

# qlmanage outputs to icon.svg.png
MASTER="$BUILD_DIR/icon.svg.png"
if [ ! -f "$MASTER" ]; then
  # Fallback: if qlmanage didn't work, use the existing icon.png
  if [ -f "$BUILD_DIR/icon.png" ]; then
    MASTER="$BUILD_DIR/icon.png"
    echo "  ▸ Using existing icon.png as master"
  else
    echo "  ✗ Cannot render SVG to PNG. Install librsvg (brew install librsvg) or provide build/icon.png"
    exit 1
  fi
fi

# Generate all required sizes for .icns
SIZES=(16 32 64 128 256 512 1024)
for size in "${SIZES[@]}"; do
  sips -z "$size" "$size" "$MASTER" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null 2>&1
done

# Also create @2x variants (required by iconutil)
sips -z 32 32 "$MASTER" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null 2>&1
sips -z 64 64 "$MASTER" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null 2>&1
sips -z 256 256 "$MASTER" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null 2>&1
sips -z 512 512 "$MASTER" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null 2>&1
sips -z 1024 1024 "$MASTER" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null 2>&1

echo "  ▸ Converting iconset → .icns"
iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
rm -rf "$ICONSET_DIR"

# Clean up qlmanage temp
rm -f "$BUILD_DIR/icon.svg.png"

echo "  ✓ icon.icns created"

# ── 2. Generate DMG background PNG ───────────────────────────────────────────
# DMG background dimensions should match the window size in electron-builder.yml
# Our config: window 660×400

echo "  ▸ Rendering DMG background SVG → PNG"
qlmanage -t -s 1320 -o "$BUILD_DIR" "$BG_SVG" 2>/dev/null || true

BG_RENDERED="$BUILD_DIR/background.svg.png"
if [ -f "$BG_RENDERED" ]; then
  # @2x retina version at full render size (1320×800)
  cp "$BG_RENDERED" "$BUILD_DIR/background@2x.png"
  sips -z 800 1320 "$BUILD_DIR/background@2x.png" >/dev/null 2>&1
  # 1x version downscaled from @2x for crisp result
  cp "$BUILD_DIR/background@2x.png" "$BUILD_DIR/background.png"
  sips -z 400 660 "$BUILD_DIR/background.png" >/dev/null 2>&1
  rm -f "$BG_RENDERED"
  echo "  ✓ background.png (660×400) + background@2x.png (1320×800) created"
else
  if [ -f "$BUILD_DIR/background.png" ]; then
    echo "  ▸ Using existing background.png"
  else
    echo "  ⚠ Could not render background SVG. DMG will use default background."
  fi
fi

# ── 3. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "Build assets ready:"
ls -lh "$BUILD_DIR/icon.icns" "$BUILD_DIR/icon.png" "$BUILD_DIR/background.png" "$BUILD_DIR/background@2x.png" 2>/dev/null || true
echo ""
echo "Run 'npm run dist:mac' to build the DMG."
