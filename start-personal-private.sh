#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
TS_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
if [ -z "$TS_IP" ]; then
  echo "Tailscale chưa connected / không tìm thấy IPv4."
  exit 2
fi
export EHS_HOME_DIR="${EHS_HOME_DIR:-$HOME/VIETCHEM_EHS}"
export HOST="$TS_IP"
export EHS_PERSONAL_PRIVATE=1
export EHS_TAILSCALE_IP="$TS_IP"
export EHS_PUBLIC_BASE_URL="http://$TS_IP:${PORT:-8787}"
export EHS_ENABLE_LEGAL_WATCH="${EHS_ENABLE_LEGAL_WATCH:-1}"
export EHS_AUTO_BACKUP="${EHS_AUTO_BACKUP:-1}"
export EHS_BACKUP_CHECK_INTERVAL_MIN="${EHS_BACKUP_CHECK_INTERVAL_MIN:-60}"
export EHS_ENFORCE_ORIGIN="${EHS_ENFORCE_ORIGIN:-1}"
export EHS_ALLOWED_HOSTS="${EHS_ALLOWED_HOSTS:-$TS_IP}"
node scripts/personal-online-preflight.mjs
exec node server.mjs
