#!/usr/bin/env bash
# install.sh — Deepmarks daemon registration
#
# Installs the Native Messaging host manifest for Chrome (and Firefox if present),
# generates the shared secret if not already present, and prints the MCP config snippet.
#
# Usage: bash daemon/install.sh
# Idempotent: safe to run multiple times.
#
# Supported:
#   macOS  — Chrome, Chromium, Chrome Canary, Firefox
#   Linux  — Chrome, Chromium, Firefox
#   Windows — Chrome via reg.exe, Firefox via PowerShell

set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_BINARY="$(cd "$SCRIPT_DIR" && node -e "console.log(require('path').resolve('dist/index.cjs'))")"
HOST_NAME="com.deepmarks.daemon"
DEEPMARKS_DIR="$HOME/.deepmarks"
SECRET_FILE="$DEEPMARKS_DIR/daemon.secret"
MANIFEST_FILE="$DEEPMARKS_DIR/${HOST_NAME}.json"

# ── Detect OS ────────────────────────────────────────────────────────────────

OS="$(uname -s 2>/dev/null || echo "Windows")"

# ── Generate shared secret if not present ────────────────────────────────────

mkdir -p "$DEEPMARKS_DIR"
chmod 700 "$DEEPMARKS_DIR"

if [ ! -f "$SECRET_FILE" ]; then
  if command -v openssl &>/dev/null; then
    openssl rand -hex 32 > "$SECRET_FILE"
  else
    node -e "const c=require('crypto');process.stdout.write(c.randomBytes(32).toString('hex')+'\n')" > "$SECRET_FILE"
  fi
  chmod 600 "$SECRET_FILE"
  echo "[deepmarks] Generated new shared secret at $SECRET_FILE"
else
  echo "[deepmarks] Using existing shared secret at $SECRET_FILE"
fi

SECRET="$(cat "$SECRET_FILE")"

# ── Build the host manifest ───────────────────────────────────────────────────

cat > "$MANIFEST_FILE" <<JSON
{
  "name": "${HOST_NAME}",
  "description": "Deepmarks companion daemon — MCP server for AI coding agents",
  "path": "${DAEMON_BINARY}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://REPLACE_WITH_YOUR_EXTENSION_ID/"
  ]
}
JSON
chmod 644 "$MANIFEST_FILE"
echo "[deepmarks] Wrote host manifest: $MANIFEST_FILE"

# ── Install for Chrome / Chromium ─────────────────────────────────────────────

install_chrome() {
  local dest_dir="$1"
  mkdir -p "$dest_dir"
  cp "$MANIFEST_FILE" "$dest_dir/${HOST_NAME}.json"
  echo "[deepmarks] Installed Chrome manifest: $dest_dir/${HOST_NAME}.json"
}

install_firefox() {
  local dest_dir="$1"
  # Firefox manifest uses 'allowed_extensions' instead of 'allowed_origins'
  local ff_manifest
  ff_manifest="$DEEPMARKS_DIR/${HOST_NAME}.firefox.json"
  cat > "$ff_manifest" <<JSON
{
  "name": "${HOST_NAME}",
  "description": "Deepmarks companion daemon — MCP server for AI coding agents",
  "path": "${DAEMON_BINARY}",
  "type": "stdio",
  "allowed_extensions": ["deepmarks@local"]
}
JSON
  mkdir -p "$dest_dir"
  cp "$ff_manifest" "$dest_dir/${HOST_NAME}.json"
  echo "[deepmarks] Installed Firefox manifest: $dest_dir/${HOST_NAME}.json"
}

if [[ "$OS" == "Darwin" ]]; then
  # Chrome
  install_chrome "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  # Chromium
  if [ -d "$HOME/Library/Application Support/Chromium" ]; then
    install_chrome "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  fi
  # Chrome Canary
  if [ -d "$HOME/Library/Application Support/Google/Chrome Canary" ]; then
    install_chrome "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  fi
  # Firefox
  if command -v firefox &>/dev/null || [ -d "/Applications/Firefox.app" ]; then
    install_firefox "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
  fi

elif [[ "$OS" == "Linux" ]]; then
  # Chrome
  install_chrome "$HOME/.config/google-chrome/NativeMessagingHosts"
  # Chromium
  if command -v chromium-browser &>/dev/null || command -v chromium &>/dev/null; then
    install_chrome "$HOME/.config/chromium/NativeMessagingHosts"
  fi
  # Firefox
  if command -v firefox &>/dev/null; then
    install_firefox "$HOME/.mozilla/native-messaging-hosts"
  fi

else
  # Windows — use reg.exe for Chrome and PowerShell for Firefox
  echo "[deepmarks] Windows detected — installing via registry"
  CHROME_KEY="HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}"
  reg.exe add "$CHROME_KEY" /ve /t REG_SZ /d "$MANIFEST_FILE" /f
  echo "[deepmarks] Installed Chrome registry key: $CHROME_KEY"

  FF_KEY="HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}"
  powershell.exe -Command "
    \$null = New-Item -Path 'HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}' -Force
    Set-ItemProperty -Path 'HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}' -Name '(Default)' -Value '${MANIFEST_FILE}'
  " && echo "[deepmarks] Installed Firefox registry key: $FF_KEY"
fi

# ── Print MCP config snippet ──────────────────────────────────────────────────

cat <<SNIPPET

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Deepmarks daemon installed successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add this to your Claude / Codex MCP configuration:

{
  "deepmarks": {
    "url": "http://127.0.0.1:6789",
    "headers": {
      "Authorization": "Bearer ${SECRET}"
    }
  }
}

Verify the daemon is running:
  node ${DAEMON_BINARY} &
  curl -s -o /dev/null -w "%{http_code}" \\
    -H "Authorization: Bearer ${SECRET}" \\
    http://127.0.0.1:6789/health
  # Expected: 200

Verify 401 without token:
  curl -s -o /dev/null -w "%{http_code}" \\
    http://127.0.0.1:6789/health
  # Expected: 401

NOTE: Replace REPLACE_WITH_YOUR_EXTENSION_ID in
  $MANIFEST_FILE
with your actual Chrome extension ID from chrome://extensions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SNIPPET
