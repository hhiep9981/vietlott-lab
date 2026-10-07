#!/usr/bin/env bash
# Install a GitHub Actions self-hosted runner (label: vn) on this Mac for
# hhiep9981/vietlott-lab, as a per-user launchd service (no sudo).
#
# Usage:   bash scripts/setup_runner.sh            # install + start
#          bash scripts/setup_runner.sh --remove   # stop + unregister
#
# Requires: gh (logged in with repo admin rights), curl, shasum.
# Run it from a normal terminal: the runner records the current PATH so
# workflow steps can find gh / uv.
set -euo pipefail

REPO="hhiep9981/vietlott-lab"
RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runner/vietlott-lab}"
LABELS="vn"
NAME="$(scutil --get LocalHostName 2>/dev/null || hostname -s)-vn"

case "$(uname -m)" in
  arm64) ARCH="osx-arm64" ;;
  x86_64) ARCH="osx-x64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [[ "${1:-}" == "--remove" ]]; then
  cd "$RUNNER_DIR"
  ./svc.sh stop || true
  ./svc.sh uninstall || true
  token=$(gh api -X POST "repos/$REPO/actions/runners/remove-token" --jq .token)
  ./config.sh remove --token "$token"
  echo "Runner removed. You can delete $RUNNER_DIR"
  exit 0
fi

command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }
gh auth status >/dev/null

if [[ -f "$RUNNER_DIR/.runner" ]]; then
  echo "Runner already configured in $RUNNER_DIR (use --remove first to reinstall)."
  exit 0
fi

# Official runner release, verified against the digest GitHub publishes.
read -r VERSION ASSET DIGEST < <(gh api repos/actions/runner/releases/latest --jq \
  ".tag_name as \$t | .assets[] | select(.name | test(\"$ARCH-[0-9.]+\\\\.tar\\\\.gz$\")) | \"\(\$t) \(.name) \(.digest)\"")
echo "Runner $VERSION ($ASSET)"

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"
curl -fsSL -o "$ASSET" "https://github.com/actions/runner/releases/download/$VERSION/$ASSET"
echo "${DIGEST#sha256:}  $ASSET" | shasum -a 256 -c -
tar xzf "$ASSET"
rm "$ASSET"

token=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
./config.sh --unattended --replace \
  --url "https://github.com/$REPO" \
  --token "$token" \
  --name "$NAME" \
  --labels "$LABELS" \
  --work _work

./svc.sh install
./svc.sh start
./svc.sh status

echo
echo "Done. Runner '$NAME' (labels: self-hosted, macOS, ARM64/X64, $LABELS)."
echo "Check: gh api repos/$REPO/actions/runners --jq '.runners[] | .name + \" \" + .status'"
echo "Note: jobs only run while this Mac is awake and online."
