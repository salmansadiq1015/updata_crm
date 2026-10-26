#!/bin/sh
# Builds UpdataHfpProbe.app (ad-hoc signed). macOS only grants Bluetooth and
# microphone access to an app bundle that declares why it needs them.
set -eu
cd "$(dirname "$0")"
APP=build/UpdataHfpProbe.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
swiftc -O main.swift SdpChannel.swift -o "$APP/Contents/MacOS/UpdataHfpProbe"
cp Info.plist "$APP/Contents/Info.plist"
codesign -s - --force "$APP"
echo "built $APP"
echo "run:  open -n -W $APP --args list --out \"\$PWD/evidence\"   (output: evidence/hfp-probe.jsonl)"
