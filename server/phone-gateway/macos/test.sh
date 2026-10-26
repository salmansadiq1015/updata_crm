#!/bin/sh
# Unit tests for the pure Swift parts of the macOS gateway probe (no Bluetooth needed).
set -eu
cd "$(dirname "$0")"
mkdir -p build
swiftc -O SdpChannel.swift Tests/main.swift -o build/sdp-tests -module-name SdpTests
./build/sdp-tests
