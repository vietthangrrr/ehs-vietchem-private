#!/bin/sh
set -eu

# Railway runtime defaults. Values explicitly configured in Railway take precedence.
export HOST="${HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"
export EHS_CLOUD_MODE="${EHS_CLOUD_MODE:-1}"
export EHS_SECURE_COOKIE="${EHS_SECURE_COOKIE:-1}"
export EHS_ENFORCE_ORIGIN="${EHS_ENFORCE_ORIGIN:-1}"
export EHS_ENABLE_LEGAL_WATCH="${EHS_ENABLE_LEGAL_WATCH:-1}"
export EHS_AUTO_BACKUP="${EHS_AUTO_BACKUP:-1}"
export EHS_BACKUP_RETENTION_DAYS="${EHS_BACKUP_RETENTION_DAYS:-30}"
export EHS_HOME_DIR="${EHS_HOME_DIR:-/data/VIETCHEM_EHS}"

mkdir -p "$EHS_HOME_DIR"
exec node server.mjs
