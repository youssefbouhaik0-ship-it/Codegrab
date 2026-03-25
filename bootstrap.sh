#!/bin/bash
# bootstrap.sh — Run this first to set up the project
# Usage: chmod +x bootstrap.sh && ./bootstrap.sh

set -e

echo "=== CodeGrab Overlay — Bootstrap ==="

# Init npm if package.json doesn't exist
if [ ! -f "package.json" ]; then
  npm init -y
  # Set correct fields
  npx json -I -f package.json \
    -e 'this.name="codegrab-overlay"' \
    -e 'this.version="0.1.0"' \
    -e 'this.description="Invisible desktop overlay that grabs code from your screen with one hotkey"' \
    -e 'this.main="dist/main/main.js"' \
    -e 'this.scripts={
      "dev": "tsc && electron .",
      "build": "tsc",
      "dist": "tsc && electron-builder",
      "dist:mac": "tsc && electron-builder --mac",
      "dist:win": "tsc && electron-builder --win",
      "dist:linux": "tsc && electron-builder --linux"
    }' 2>/dev/null || true
fi

echo "Installing dependencies..."
npm install electron --save-dev
npm install electron-builder --save-dev
npm install typescript --save-dev
npm install tesseract.js

echo "Creating directory structure..."
mkdir -p src/main
mkdir -p src/renderer/styles
mkdir -p src/renderer/components
mkdir -p src/shared
mkdir -p skills/glassmorphism-overlay

echo "Creating tsconfig.json..."
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

echo "Creating electron-builder config..."
cat > electron-builder.yml << 'EOF'
appId: com.codegrab.overlay
productName: CodeGrab
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - src/renderer/**/*
  - "!src/**/*.ts"
mac:
  category: public.app-category.developer-tools
  target:
    - dmg
    - zip
  darkModeSupport: true
  extendInfo:
    LSUIElement: true  # Hide from Dock (menubar app)
win:
  target:
    - nsis
    - portable
  requestedExecutionLevel: asInvoker
linux:
  target:
    - AppImage
  category: Development
nsis:
  oneClick: true
  allowToChangeInstallationDirectory: false
dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
publish:
  provider: github
  releaseType: release
EOF

echo ""
echo "=== Done! ==="
echo ""
echo "Next steps for Claude Code:"
echo "  1. Read CLAUDE.md"
echo "  2. Read MASTER_PROMPT.md"  
echo "  3. Read skills/glassmorphism-overlay/SKILL.md"
echo "  4. Read TASK.md"
echo "  5. Start building Phase 1"
