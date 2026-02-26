#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing system dependencies for Tauri..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  pkg-config build-essential curl wget file \
  libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev patchelf \
  > /dev/null 2>&1

echo "==> Installing pnpm..."
corepack enable
corepack prepare pnpm@latest --activate

echo "==> Installing JavaScript dependencies..."
pnpm install --frozen-lockfile

echo "==> Dev container ready!"
