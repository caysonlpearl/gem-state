#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOLS_DIR="$APP_DIR/.parkvault-tools"
SF3D_DIR="$TOOLS_DIR/stable-fast-3d"
VENV_DIR="$TOOLS_DIR/venv"

if [[ "$(uname -s)" == "Darwin" ]] && ! /opt/homebrew/bin/brew list libomp >/dev/null 2>&1; then
  echo "OpenMP is required. Install it with: brew install libomp"
  exit 1
fi

mkdir -p "$TOOLS_DIR/output" "$TOOLS_DIR/review"

if [[ ! -d "$SF3D_DIR/.git" ]]; then
  git clone --depth 1 https://github.com/Stability-AI/stable-fast-3d.git "$SF3D_DIR"
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  python3 -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools==69.5.1 wheel
"$VENV_DIR/bin/python" -m pip install torch torchvision
(
  cd "$SF3D_DIR"
  "$VENV_DIR/bin/python" -m pip install --no-build-isolation -r requirements.txt
)

git -C "$SF3D_DIR" rev-parse HEAD > "$TOOLS_DIR/sf3d-version.txt"

echo
echo "ParkVault 3D generator dependencies are installed."
echo "Final account step: accept the Stable Fast 3D license on Hugging Face, then run:"
echo "  $VENV_DIR/bin/huggingface-cli login"
