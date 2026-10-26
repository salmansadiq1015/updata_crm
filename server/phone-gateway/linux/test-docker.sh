#!/bin/sh
# Linux checks from a Mac: unit tests + fake-BlueZ end-to-end run in Ubuntu 24.04 (the gateway VM's OS).
# Files go in over stdin (no bind mount, so Docker needs no access to this folder).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tar -C "$here" --exclude evidence --exclude prompts --exclude __pycache__ -cf - . |
docker run --rm -i ubuntu:24.04 sh -c '
  mkdir /probe && tar -C /probe -xf - &&
  apt-get -qq update >/dev/null &&
  DEBIAN_FRONTEND=noninteractive apt-get -qq install -y --no-install-recommends python3 python3-dbus python3-gi dbus >/dev/null &&
  sh /probe/tests/run-fake-e2e.sh'
