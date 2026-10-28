#!/bin/bash
# Reuse the pinned SDK and its installed Python environment, independent of
# whichever Homebrew Python happens to be first on PATH. Never install or erase.
set -eo pipefail
updata_firmware_dir=$(cd "$(dirname "$0")/firmware" && pwd)
updata_idf_path=${IDF_PATH:-$HOME/esp/esp-idf-v5.5.6}
if [ ! -f "$updata_idf_path/export.sh" ]; then
  echo "ESP-IDF v5.5.6 not found at $updata_idf_path; set IDF_PATH to the installed SDK." >&2
  exit 1
fi

if [ -z "${IDF_PYTHON_ENV_PATH:-}" ]; then
  # Prefer the environment used by this project's existing build, when present.
  updata_cached_python=$(sed -n 's/^PYTHON:[^=]*=//p' "$updata_firmware_dir/build/CMakeCache.txt" 2>/dev/null || true)
  if [ -x "$updata_cached_python" ] && [[ "$updata_cached_python" == */idf5.5_py*_env/bin/python ]]; then
    export IDF_PYTHON_ENV_PATH=${updata_cached_python%/bin/python}
  else
    shopt -s nullglob
    updata_envs=("${IDF_TOOLS_PATH:-$HOME/.espressif}"/python_env/idf5.5_py*_env)
    if [ "${#updata_envs[@]}" -ne 1 ]; then
      echo "Set IDF_PYTHON_ENV_PATH to the installed ESP-IDF 5.5 Python environment (found ${#updata_envs[@]})." >&2
      exit 1
    fi
    export IDF_PYTHON_ENV_PATH=${updata_envs[0]}
  fi
fi

. "$updata_idf_path/export.sh" >/dev/null
updata_idf_version=$(idf.py --version)
if [ "$updata_idf_version" != 'ESP-IDF v5.5.6' ]; then
  echo "Expected ESP-IDF v5.5.6; found $updata_idf_version. Refusing to build/flash with another SDK." >&2
  exit 1
fi
cd "$updata_firmware_dir"
exec idf.py "$@"
