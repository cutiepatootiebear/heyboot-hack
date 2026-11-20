#!/usr/bin/env bash
# Fill in .env.local one key at a time. What you paste is hidden and never printed.
# Run from the repo folder:  bash scripts/fill-env.sh
# Press Enter without pasting to keep a line as it is.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || cp .env.example "$ENV_FILE"

set_key() { # name value
  KEY="$1" VAL="$2" python3 - "$ENV_FILE" <<'PY'
import os, sys, re
path, key, val = sys.argv[1], os.environ["KEY"], os.environ["VAL"]
lines = open(path).read().splitlines()
pat = re.compile(rf"^{re.escape(key)}=")
for i, l in enumerate(lines):
    if pat.match(l):
        lines[i] = f"{key}={val}"
        break
else:
    lines.append(f"{key}={val}")
open(path, "w").write("\n".join(lines) + "\n")
PY
}

ask() { # name prompt [check-prefix] [default]
  local name="$1" prompt="$2" prefix="${3:-}" default="${4:-}" v
  while true; do
    printf '\n%s\n> ' "$prompt"
    IFS= read -rs v; echo
    v="$(printf '%s' "$v" | tr -d '[:space:]')"
    if [ -z "$v" ]; then
      if [ -n "$default" ]; then set_key "$name" "$default"; echo "  set to $default"; else echo "  skipped (unchanged)"; fi
      return
    fi
    if [ "$name" = STRIPE_SECRET_KEY ] && [[ "$v" == sk_live_* ]]; then
      echo "  That is a LIVE key. Use the TEST key (starts with sk_test_). Try again."; continue
    fi
    if [ -n "$prefix" ] && [[ "$v" != "$prefix"* ]]; then
      echo "  That doesn't start with $prefix. Try again (or press Enter to skip)."; continue
    fi
    set_key "$name" "$v"; echo "  saved (${#v} characters)"; return
  done
}

echo "Paste each value when asked, then press Enter. Nothing you paste will show on screen."
ask ANTHROPIC_API_KEY    "Anthropic key (starts with sk-ant-):" "sk-ant-"
ask STRIPE_SECRET_KEY    "Stripe TEST secret key (starts with sk_test_):" "sk_test_"
ask SINGLESTORE_HOST     "SingleStore Host (the long address):"
ask SINGLESTORE_USER     "SingleStore Username (often admin):"
ask SINGLESTORE_PASSWORD "SingleStore Password:"
ask SINGLESTORE_DATABASE "Database name (just press Enter for heyboot):" "" "heyboot"
chmod 600 "$ENV_FILE"
echo
echo "Done. Go back to Claude and type: saved"
