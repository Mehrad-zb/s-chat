#!/usr/bin/env bash
# Renders the PNG app icons (web + Android) from the SVG sources in public/icons. Needs rsvg-convert.
set -e
cd "$(dirname "$0")/.."
r() { rsvg-convert -w "$2" -h "$2" "public/icons/$1.svg" -o "$3"; }
r icon 512 public/icons/icon-512.png
r icon 192 public/icons/icon-192.png
r maskable 512 public/icons/maskable-512.png
r maskable 180 public/icons/apple-touch-icon.png
r badge 96 public/icons/badge-96.png
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  mkdir -p android/app/src/main/res/mipmap-${d%%:*}
  r icon ${d##*:} android/app/src/main/res/mipmap-${d%%:*}/ic_launcher.png
done
r icon 288 android/app/src/main/res/drawable/splash.png
