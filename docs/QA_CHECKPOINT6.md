# Checkpoint 6 — Data & Update Hardening QA

Release target: data-safe internal pilot.

## Gates tested
- Persistent data directory independent from app version directory.
- Versioned schema migration table with checksum guard.
- Automatic validated pre-migration backup of SQLite + uploads.
- Business-table row-count preservation check before/after migration.
- Migration failure path restores validated snapshot before aborting startup.
- Daily automatic backup policy + retention controls.
- Manual backup also persisted server-side and downloaded.
- Legacy CP5.x data adoption tool.
- Offline admin password reset; normal startup no longer resets password.
- System Health exposes active data/database/upload/backup paths and schema version.
- Full prior regression suite retained.

## Migration preservation regression
A database was prepared with normal CP5.x-equivalent business schema and a sentinel task, CP6 migration metadata was removed, then Checkpoint 6 was started against the same live data path.

Verified:
- sentinel business record remained unchanged;
- employee row count remained unchanged;
- schema migrations were registered;
- pre-migration `.tar.gz` backup was created and SHA-256 validated;
- uploaded sentinel evidence was present inside the pre-migration backup.

## Release stance
Checkpoint 6 substantially improves data safety for local single-service deployment. Production deployment still requires off-device backup retention, TLS/reverse proxy policy, Windows OCR dependency deployment and an actual restore drill on the target workstation/NAS policy.
