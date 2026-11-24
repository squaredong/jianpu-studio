#!/bin/bash
set -e
cd "$(dirname "$0")/.."
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm install
npm run build
npx electron-builder --mac --universal
echo "macOS 安装包已生成在 dist-electron/ 目录"
open dist-electron
