#!/bin/sh
# Compiles the firmware's pure modules for the host and runs their tests.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
main="$here/../../main"
out="${TMPDIR:-/tmp}/updata-esp32-host-tests"
${CC:-cc} -std=c11 -Wall -Wextra -Werror -O1 -fsanitize=address,undefined \
  -o "$out" "$here/test_main.c" "$main/proto.c" "$main/dialauth.c" "$main/ring.c"
"$out"
